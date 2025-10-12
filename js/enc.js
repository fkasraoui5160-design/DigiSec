// Fonction pour chiffrer un fichier (simple version)
function encryptFile() {
    const fileInput = document.getElementById('fileInput');
    const algorithm = document.getElementById('algorithm').value;

    if (!fileInput.files[0]) {
        alert("Veuillez sélectionner un fichier.");
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const fileData = e.target.result;

        // Choisir un algorithme de chiffrement en fonction de la sélection
        let encrypted;
        const key = CryptoJS.lib.WordArray.random(32); // Clé de 256 bits

        if (algorithm === 'AES-GCM') {
            encrypted = CryptoJS.AES.encrypt(fileData, key, {
                mode: CryptoJS.mode.GCM,
                padding: CryptoJS.pad.Pkcs7
            });
        } else if (algorithm === 'AES-CBC') {
            encrypted = CryptoJS.AES.encrypt(fileData, key, {
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });
        }

        // Convertir le texte chiffré en format binaire (WordArray)
        const encryptedData = encrypted.ciphertext;
        
        // Préparer le téléchargement du fichier chiffré
        const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });
        const downloadLink = document.getElementById('downloadLink');
        downloadLink.href = URL.createObjectURL(encryptedBlob);
        downloadLink.style.display = 'inline-block';
        downloadLink.download = file.name + '.enc';
    };

    reader.readAsArrayBuffer(file); // Lire le fichier comme un ArrayBuffer
}
