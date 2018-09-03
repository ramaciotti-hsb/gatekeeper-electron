import forge from 'node-forge'
import fs from 'fs'
import path from 'path'

export default async (directory) => {
    const pki = forge.pki

    // generate a keypair and create an X.509v3 certificate
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    // alternatively set public key from a csr
    //cert.publicKey = csr.publicKey;
    // NOTE: serialNumber is the hex encoded value of an ASN.1 INTEGER.
    // Conforming CAs should ensure serialNumber is:
    // - no more than 20 octets
    // - non-negative (prefix a '00' if your value starts with a '1' bit)
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    const attrs = [{
    name: 'commonName',
    value: 'localhost'
    }, {
    name: 'countryName',
    value: 'AU'
    }, {
    shortName: 'ST',
    value: 'New-South-Wales'
    }, {
    name: 'localityName',
    value: 'Sydney'
    }, {
    name: 'organizationName',
    value: 'Ramaciotti HSB'
    }, {
    shortName: 'OU',
    value: 'Gatekeeper-localhost'
    }];
    cert.setSubject(attrs);
    // alternatively set subject from a csr
    //cert.setSubject(csr.subject.attributes);
    cert.setIssuer(attrs);
    cert.setExtensions([{
        name: 'basicConstraints',
        cA: true
        }, {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }, {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true,
            codeSigning: true,
            emailProtection: true,
            timeStamping: true
        }, {
            name: 'nsCertType',
            client: true,
            server: true,
            email: true,
            objsign: true,
            sslCA: true,
            emailCA: true,
            objCA: true
        }, {
        name: 'subjectKeyIdentifier'
    }]);
    // self-sign certificate
    cert.sign(keys.privateKey);

    // convert a Forge certificate to PEM
    const pem = pki.certificateToPem(cert);

    const key = pki.privateKeyToPem(keys.privateKey)

    return new Promise((resolve, reject) => {
        fs.writeFile(path.join(directory, 'localhost.crt'), pem, (error) => {
            console.log(error)
            fs.writeFile(path.join(directory, 'localhost.key'), key, (error2) => {
                console.log(error2)
                resolve()
            })        
        })
    })
}
