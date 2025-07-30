const { mysqlQuery, deleteFile, hashPassword, isPasswordValid } = require('../utilityclient/query')
const otpGenerator = require('otp-generator')
const sendEmail = require('../utilityclient/email')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const yup = require('yup')
const { subYears } = require('date-fns')
const md5 = require('md5')
const { capitalizeWords } = require('../utilityclient/utils')



async function user(req, res) {
 try {
    const user = await mysqlQuery(/*sql*/`select * from users `)
    if(!user) {
        return res.status(204).send('not found')
    }
    res.status(200).send(user)
 } catch (error) {
    req.log.error(error)
        res.status(500).json(error)
 }
}

module.exports = (app) => {

    app.get('/users', user)
}


