const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const nodemailer = require('nodemailer');

const app = express();
const port = 3000;

// Load CA's private key and certificate
const caPrivateKeyPem = fs.readFileSync('internal-ca/ca-key.pem', 'utf8');
const caPrivateKey = forge.pki.privateKeyFromPem(caPrivateKeyPem);

const caCertPem = fs.readFileSync('internal-ca/ca-cert.pem', 'utf8');
const caCert = forge.pki.certificateFromPem(caCertPem);

// Setup multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Middleware to serve static files
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Function to sign data
function signData(data) {
    const md = forge.md.sha256.create();
    md.update(data, 'utf8');
    const signature = caPrivateKey.sign(md);
    return forge.util.encode64(signature);
}

// Function to generate client certificate
function generateClientCertificate(commonName, email, organization, unit, country, state, city) {
    const keys = forge.pki.rsa.generateKeyPair(2048);

    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1); // Valid for 1 year

    const attrs = [
        { name: 'commonName', value: commonName },
        { name: 'emailAddress', value: email },
        { name: 'organizationName', value: organization },
        { name: 'organizationalUnitName', value: unit },
        { name: 'countryName', value: country },
        { name: 'stateOrProvinceName', value: state },
        { name: 'localityName', value: city }
    ];

    cert.setSubject(attrs);
    cert.setIssuer(caCert.subject.attributes);
    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
        { name: 'nsCertType', client: true }
    ]);

    cert.sign(caPrivateKey, forge.md.sha256.create());

    return {
        privateKey: forge.pki.privateKeyToPem(keys.privateKey),
        certificate: forge.pki.certificateToPem(cert)
    };
}

// Function to send email
function sendEmail(to, subject, text) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'your-email@gmail.com',
            pass: 'your-email-password'
        }
    });

    const mailOptions = {
        from: 'your-email@gmail.com',
        to,
        subject,
        text
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Email sent: ' + info.response);
    });
}

// Endpoint to handle document signing
app.post('/sign-document', upload.single('document'), (req, res) => {
    if (!req.file) {
        console.error('No document uploaded.');
        return res.status(400).send('No document uploaded.');
    }

    const documentType = req.body.documentType;

    // Read the uploaded file
    const filePath = path.join(__dirname, req.file.path);
    fs.readFile(filePath, (err, fileBuffer) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Error reading file.');
        }

        // Generate a digital signature using CA's private key
        const signature = signData(fileBuffer.toString('binary'));

        // Cleanup the uploaded file
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
                return res.status(500).send('Error deleting file.');
            }

            // Send the signature and document type back
            res.json({ signature, documentType });
        });
    });
});

// Endpoint to handle certificate generation
app.post('/generate', (req, res) => {
    const { commonName, email, organization, unit, country, state, city } = req.body;
    const { privateKey, certificate } = generateClientCertificate(commonName, email, organization, unit, country, state, city);

    // Combine the certificate and private key into a single file
    const combined = `-----BEGIN CERTIFICATE-----\n${certificate}\n-----END CERTIFICATE-----\n-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
    const filePath = path.join(__dirname, 'certificates', `${commonName}-certificate.pem`);

    fs.writeFile(filePath, combined, (err) => {
        if (err) {
            console.error('Error writing certificate file:', err);
            return res.status(500).send('Error writing certificate file.');
        }

        res.download(filePath, (err) => {
            if (err) {
                console.error('Error sending certificate file:', err);
            }

            // Cleanup the file after download
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting certificate file:', err);
                }
            });
        });
    });
});

// Endpoint to handle document encryption
app.post('/encrypt-document', upload.single('document'), (req, res) => {
    if (!req.file) {
        console.error('No document uploaded.');
        return res.status(400).send('No document uploaded.');
    }

    // Read the uploaded file
    const filePath = path.join(__dirname, req.file.path);
    fs.readFile(filePath, (err, fileBuffer) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Error reading file.');
        }

        // Encrypt the document
        const cipher = crypto.createCipher('aes-256-cbc', 'encryption-key');
        let encrypted = cipher.update(fileBuffer, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Cleanup the uploaded file
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
                return res.status(500).send('Error deleting file.');
            }

            // Send the encrypted document back
            res.json({ encrypted });
        });
    });
});

// Endpoint to handle document decryption
app.post('/decrypt-document', upload.single('document'), (req, res) => {
    if (!req.file) {
        console.error('No document uploaded.');
        return res.status(400).send('No document uploaded.');
    }

    // Read the uploaded file
    const filePath = path.join(__dirname, req.file.path);
    fs.readFile(filePath, (err, fileBuffer) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Error reading file.');
        }

        // Decrypt the document
        const decipher = crypto.createDecipher('aes-256-cbc', 'encryption-key');
        let decrypted = decipher.update(fileBuffer.toString(), 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        // Cleanup the uploaded file
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
                return res.status(500).send('Error deleting file.');
            }

            // Send the decrypted document back
            res.json({ decrypted });
        });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
