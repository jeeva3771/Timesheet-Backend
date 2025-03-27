const nodemailer = require('nodemailer')
const {
    EMAIL_AUTH,
    EMAIL_FROM
} = require('../config/email')

const transporter = nodemailer.createTransport(EMAIL_AUTH)

function sendEmail({
    from = EMAIL_FROM,
    to, 
    subject, 
    html
}) {
    const mailOptions = {
        from,
        to,
        subject,
        html
    }
    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                reject(err)
            } else {
                resolve(info)
            }    
        })
    })
}

module.exports = sendEmail