const EMAIL_FROM = 'jeeva37710@gmail.com'

const EMAIL_AUTH = {
        service: 'gmail',
        auth: {
            user: EMAIL_FROM,
            pass: 'osvj lnpx hjuu znlo'
        },
        tls: {
            rejectUnauthorized: false // Allow self-signed certificates
        }
    }

module.exports =  {
    EMAIL_AUTH, 
    EMAIL_FROM
}

// module.exports = {
//     EMAIL_AUTH: {
//         host: 'smtp.gmail.com', // Replace with your SMTP host
//         port: 465, // 587 for TLS, 465 for SSL
//         secure: true, // Use true for SSL, false for TLS
//         auth: {
//             user: EMAIL_FROM,
//             pass: 'osvj lnpx hjuu znlo'
//         },
//         tls: {
//             rejectUnauthorized: false // Allow self-signed certificates
//         }
//     },
// }
