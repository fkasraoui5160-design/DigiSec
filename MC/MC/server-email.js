const express = require('express');
const multer = require('multer');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const nodemailer = require('nodemailer');
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (including HTML, CSS, and JS) from the root directory
app.use(express.static(__dirname));

// Load CA certificate and private key (replace with your own CA cert and key)
const caCertPem = fs.readFileSync('internal-ca/ca-cert.pem', 'utf8');
const caKeyPem = fs.readFileSync('internal-ca/ca-key.pem', 'utf8');
const caCert = forge.pki.certificateFromPem(caCertPem);
const caKey = forge.pki.privateKeyFromPem(caKeyPem);

app.post('/generate-cert', upload.fields([{ name: 'idDocument' }, { name: 'proofOfAddress' }, { name: 'authorizationLetter' }]), (req, res) => {
    const fullName = req.body.fullName;
    const email = req.body.email;
    const phone = req.body.phone;
    const organization = req.body.organization;
    const department = req.body.department;
    const jobTitle = req.body.jobTitle;
    const address = req.body.address;
    const domainValidation = req.body.domainValidation;

    // Generate timestamp
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');

    // Generate a new key pair
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    const attrs = [{
      name: 'commonName',
      value: fullName
    }, {
      name: 'emailAddress',
      value: email
    }];
    
    cert.setSubject(attrs);
    cert.setIssuer(caCert.subject.attributes);
    cert.sign(caKey);

    const pem = {
        privateKey: forge.pki.privateKeyToPem(keys.privateKey),
        certificate: forge.pki.certificateToPem(cert)
    };

    // Save certificate and private key to files
    const certPath = path.join(__dirname, `${email}-cert.pem`);
    const keyPath = path.join(__dirname, `${email}-key.pem`);
    
    fs.writeFileSync(certPath, pem.certificate);
    fs.writeFileSync(keyPath, pem.privateKey);

    // Save timestamp
    const timestampPath = path.join(__dirname, `${email}-timestamp.txt`);
    fs.writeFileSync(timestampPath, timestamp);

    res.json({
        message: 'Certificate generated successfully!',
        certDownloadLink: `http://localhost:3000/download/${email}-cert.pem`,
        keyDownloadLink: `http://localhost:3000/download/${email}-key.pem`,
        timestampDownloadLink: `http://localhost:3000/download/${email}-timestamp.txt`
    });
});

// Endpoint to handle certificate download
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, filename);
    res.download(filePath);
});

app.post('/send-email', (req, res) => {
    const senderEmail = req.body.senderEmail;
    const senderPassword = req.body.senderPassword;
    const receiverEmail = req.body.receiverEmail;
    const emailSubject = req.body.emailSubject;
    const emailContent = req.body.emailContent;

    // Load the sender's certificate and private key
    const certPath = path.join(__dirname, `${senderEmail}-cert.pem`);
    const keyPath = path.join(__dirname, `${senderEmail}-key.pem`);
    const senderCertPem = fs.readFileSync(certPath, 'utf8');
    const senderKeyPem = fs.readFileSync(keyPath, 'utf8');
    const senderCert = forge.pki.certificateFromPem(senderCertPem);
    const senderKey = forge.pki.privateKeyFromPem(senderKeyPem);

    // Create the email content
    const p7 = forge.pkcs7.createEnvelopedData();
    p7.addRecipient(senderCert);
    p7.content = forge.util.createBuffer(emailContent, 'utf8');
    p7.encrypt();

    // Convert to PEM format
    const encryptedContent = forge.pkcs7.messageToPem(p7);

    // Setup email transporter
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: "",
            pass: ""  // Use the provided password here
        }
    });

    // Send encrypted email
    const mailOptions = {
        from: senderEmail,
        to: receiverEmail,
        subject: emailSubject,
        text: encryptedContent
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return res.status(500).json({ message: error.toString() });
        }
        res.json({ message: 'Encrypted email sent successfully!' });
    });
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
