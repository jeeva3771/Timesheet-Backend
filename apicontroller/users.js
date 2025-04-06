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

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', 'useruploads'))
    },
    filename: function (req, file, cb) {
        const userId = req.params.userId
        cb(null, `${userId}_${Date.now()}.jpg`)
    }
})

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/jpeg') {
        cb(null, true)
    } else {
        req.fileValidationError = 'Invalid file type. Only JPEG files are allowed.'
        cb(null, false)
    }
}
const OTP_LIMIT_NUMBER = 6
const OTP_OPTION = {
    digits: true,
    upperCaseAlphabets: true,
    lowerCaseAlphabets: false,
    specialChars: false
}

const upload = multer({ storage, fileFilter })
const multerMiddleware = upload.single('image')

const mainDetailsUserValidation = yup.object().shape({
    name: yup.string().min(2, 'Name is invalid').required('Name is required'),
    dob: yup
        .date()
        .max(subYears(new Date(), 18), 'You must be at least 18 years old')
        .required('DOB is required'),
    emailId: yup.string().email('Invalid email format').required('Email is required'),
})

const userValidation = yup.object().shape({
    password: yup
        .string()
        .min(6, 'Password must be at least 6 characters long')
        .matches(/[\W_]/, 'Password must contain at least one special character')
        .required('Password is required'),

    role: yup
        .string()
        .oneOf(['admin', 'employee', 'manager', 'hr'], 'Role is invalid') 
        .required('Role is required'),

    status: yup
        .number()
        .oneOf([0, 1], 'Status is invalid')
        .required('Status is required'),
})

const ALLOWED_UPDATE_KEYS = [
    "name",
    "dob",
    "emailId",
    "password",
    "role",
    "status",
]

async function authentication(req, res) {
    const mysqlClient = req.app.mysqlClient
    const {
        emailId,
        password
    } = req.body

    try {
        const [user] = await mysqlQuery(/*sql*/`
            SELECT u.*,
                DATE_FORMAT(u.dob, "%d-%b-%Y") AS birth 
            FROM users AS u
            WHERE u.emailId = ? AND 
                u.deletedAt IS NULL`,
            [emailId]
        , mysqlClient)

        if (!user) {
            req.session.isLogged = false
            req.session.user = null
            return res.status(400).send('Invalid Email.')
        }

        const isValid = await isPasswordValid(password, user.password)

        if (isValid) {
            req.session.user = user
            req.session.isLogged = true
            res.status(200).send(user)
        } else {
            req.session.isLogged = false
            req.session.user = null
            res.status(400).send('Invalid Password.')
        }
    } catch (error) {
        console.error(error)
        req.log.error(error)
        res.status(500).send(error)
    }
}

function userLogOut(req, res) {
    req.session.destroy((err) => {
        if (err) logger.error()
        // res.redirect('/login')
        return res.status(200).send('Logout successfully')
    })
}

async function readUsers(req, res) {    
    const mysqlClient = req.app.mysqlClient
    const limit = req.query.limit ? parseInt(req.query.limit) : null
    const page = req.query.page ? parseInt(req.query.page) : null
    const offset = limit && page ? (page - 1) * limit : null
    const orderBy = req.query.orderby
    const sort = req.query.sort
    const searchQuery = req.query.search || ''
    const searchPattern = `%${searchQuery}%`
    let queryParameters = null

    if (!['admin'].includes(req.session.user.role)) {
        return res.status(409).send('User does not have permission to view')
    }
    
    let usersQuery = /*sql*/`
        SELECT 
            u.*,
            ur.name AS createdName
        FROM users AS u
        LEFT JOIN users AS ur ON ur.userId = u.createdBy
        WHERE 
            u.deletedAt IS NULL AND 
            (u.name LIKE ? OR u.emailId LIKE ? OR u.role LIKE ? OR ur.name LIKE ?)
        ORDER BY ${orderBy} ${sort}`
        
    const countQuery = /*sql*/`
        SELECT
            COUNT(*) AS totalUserCount
        FROM 
            users AS u
        LEFT JOIN users AS ur ON ur.userId = u.createdBy
        WHERE 
            u.deletedAt IS NULL AND
            (u.name LIKE ? OR u.emailId LIKE ? OR u.role LIKE ? OR ur.name LIKE ?)
        ORDER BY ${orderBy} ${sort}`


    if (limit >= 0) {
        usersQuery += ' LIMIT ? OFFSET ?'
        queryParameters = [searchPattern, searchPattern, searchPattern,
            searchPattern, limit, offset]
    } else {
        queryParameters = [searchPattern, searchPattern, searchPattern,
            searchPattern]
    }
    const countQueryParameters = [searchPattern, searchPattern, searchPattern,
        searchPattern]

    try {
        const [users, totalCount] = await Promise.all([
            mysqlQuery(usersQuery, queryParameters, mysqlClient),
            mysqlQuery(countQuery, countQueryParameters, mysqlClient)
        ])

        res.status(200).send({
            users: users,
            userCount: totalCount[0].totalUserCount
        })

    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function readUserById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const userId = req.params.userId

    if (!['admin'].includes(req.session.user.role)) {
        return res.status(409).send('User does not have permission to view')
    }

    try {
        const userIsValid = await validateUserById(userId, mysqlClient)
        if (!userIsValid) {
            return res.status(404).send('User is not found')
        }

        const [user] = await mysqlQuery(/*sql*/`
            SELECT 
                u.*,
                ur.name AS createdName,
                ur2.name AS updatedName,
                DATE_FORMAT(u.dob, "%d-%b-%Y") AS birth,
                DATE_FORMAT(u.createdAt, "%d-%b-%Y %r") AS createdTime,
                DATE_FORMAT(u.updatedAt, "%d-%b-%Y %r") AS updatedTime
            FROM users AS u
            LEFT JOIN users AS ur ON ur.userId = u.createdBy
            LEFT JOIN users AS ur2 ON ur2.userId = u.updatedBy
            WHERE 
                u.deletedAt IS NULL AND u.userId = ?`, 
            [userId], mysqlClient)
            
        res.status(200).send(user)
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}
async function readUsersNameAndRole(req, res) {
    const mysqlClient = req.app.mysqlClient
    const adminAndManager = req.query.adminAndManager === 'true'
    
    try {
        let userDetails = /*sql*/`
            SELECT name, role FROM users
            WHERE deletedAt IS NULL AND
                status = 1 AND`

        if (adminAndManager) {
            userDetails += " (role = 'admin' OR role = 'manager')"
        } else {
            userDetails += " (role = 'hr' OR role = 'employee')"
        }
        userDetails += " ORDER BY name ASC"

        const nameAndRole = await mysqlQuery(userDetails, [], mysqlClient)
        return res.status(200).send(nameAndRole)
    } catch (error) {
        req.log.error(error)    
        res.status(500).send(error)
    }
}

async function createUser(req, res) {
    const mysqlClient = req.app.mysqlClient
    const {
        name, 
        dob, 
        emailId, 
        password, 
        role, 
        status
    } = req.body    
    const createdBy = req.session.user.userId
    let uploadedFilePath = req.file?.path || null

    if (!['admin'].includes(req.session.user.role)) {
        if (uploadedFilePath) {
            await deleteFile(uploadedFilePath, fs)
        }
        return res.status(409).send('User does not have permission to create')
    }

    try {
        const validationErrors = await validatePayload(req.fileValidationError, req.body, false, null, mysqlClient)
        if (validationErrors.length > 0) {
            if (uploadedFilePath) {
                await deleteFile(uploadedFilePath, fs)
            }
            return res.status(400).send(validationErrors)
        }

        if (uploadedFilePath){
            await sharp(fs.readFileSync(uploadedFilePath))
                .resize({
                    width: parseInt(process.env.IMAGE_WIDTH),
                    height: parseInt(process.env.IMAGE_HEIGHT),
                    fit: sharp.fit.cover,
                    position: sharp.strategy.center,
                })
                .toFile(uploadedFilePath)
        }

        const hashGenerator = await hashPassword(password)

        const newUser = await mysqlQuery(/*sql*/`
            INSERT INTO users 
                (name, dob, emailId, password, role, status, createdBy)
            values(?, ?, ?, ?, ?, ?, ?)`,
            [name, dob, emailId, hashGenerator, role, status, createdBy], mysqlClient)
        
        if (newUser.affectedRows === 0) {
            await deleteFile(uploadedFilePath, fs)
            return res.status(400).send('No insert was made')
        }

        if (uploadedFilePath) {
            const originalDir = path.dirname(uploadedFilePath)
            const filename = `${newUser.insertId}_${Date.now()}.jpg`
            const newFilePath = path.join(originalDir, filename)

            fs.rename(uploadedFilePath, newFilePath, async (err) => {
                if (err) {
                    await deleteFile(uploadedFilePath, fs)
                    return res.status(400).send('Error renaming file')
                }
            })

            const image = await mysqlQuery(/*sql*/`
                UPDATE 
                    users 
                    SET image = ? 
                WHERE 
                    userId = ? AND 
                    deletedAt IS NULL`,
                [filename, newUser.insertId], mysqlClient)

            if (image.affectedRows === 0) {
                await deleteFile(uploadedFilePath, fs)
                return res.status(400).send('Image is not set')
            }
        }

        res.status(201).send('Successfully created.')
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function editUser(req, res) {
    const userId = req.params.userId
    const mysqlClient = req.app.mysqlClient
    const updatedBy = req.session.user.userId
    let uploadedFilePath
    const values = []
    const updates = []

    if (!['admin'].includes(req.session.user.role) && userId !== req.session.user.userId) {
        return res.status(409).send('User does not have permission to edit')
    }

    ALLOWED_UPDATE_KEYS.forEach((key) => {
        keyValue = req.body[key]
        if (keyValue !== undefined) {
            values.push(keyValue)
            updates.push(` ${key} = ?`)
        }
    })

    updates.push('updatedBy = ?')
    values.push(updatedBy, userId)
    
    if (req.file) {
        uploadedFilePath = req.file.path
    }

    try {
        const userIsValid = await validateUserById(userId, mysqlClient)
        if (!userIsValid) {
            if (uploadedFilePath) {
                await deleteFile(uploadedFilePath, fs)
            }
            return res.status(404).send('User is not found')
        }

        const validUpdate = await validatePayload(req.fileValidationError, req.body, true, userId, mysqlClient)
        if (validUpdate.length > 0) {
            if (uploadedFilePath) {
                await deleteFile(uploadedFilePath, fs)
            }
            return res.status(400).send(validUpdate)
        }

        const oldFilePath = await readUserImage(userId, mysqlClient)

        const passwordIndex = ALLOWED_UPDATE_KEYS.indexOf('password')
        if (passwordIndex >= 0 && req.body.password) {
            const hashedPassword = md5(req.body.password)
            values[passwordIndex] = hashedPassword
        }

        const updateUser = await mysqlQuery(/*sql*/`
            UPDATE 
                users SET ${updates.join(', ')} 
            WHERE userId = ? AND 
                deletedAt IS NULL`,
            values, mysqlClient)

        if (updateUser.affectedRows === 0) {
            if (uploadedFilePath) {
                await deleteFile(uploadedFilePath, fs)
            }
            return res.status(204).send('No changes made')
        }

        if (oldFilePath !== uploadedFilePath) {
            await sharp(fs.readFileSync(uploadedFilePath))
            .resize({
                width: parseInt(process.env.IMAGE_WIDTH),
                height: parseInt(process.env.IMAGE_HEIGHT),
                fit: sharp.fit.cover,
                position: sharp.strategy.center,
            })
            .toFile(uploadedFilePath)

            const pathName = path.basename(uploadedFilePath)

            const imageUpdate =  await mysqlQuery(/*sql*/`
                UPDATE 
                    users 
                    SET image = ? 
                WHERE 
                    userId = ? AND 
                    deletedAt IS NULL`,
                [pathName, userId], mysqlClient)

            if (imageUpdate.affectedRows === 0) {
                await deleteFile(uploadedFilePath, fs)
                return res.status(204).send('Image not changed')
            }
            const rootDir = path.resolve(__dirname, '../')
            const imagePath = path.join(rootDir, 'useruploads', oldFilePath)
            await deleteFile(imagePath, fs)
        }

        res.status(200).send('Successfully updated.')
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function deleteUserById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const userId = req.params.userId
    const deletedBy = req.session.user.userId

    if (!['admin'].includes(req.session.user.role) && userId !== req.session.user.userId) {
        return res.status(409).send('User does not have permission to delete')
    }

    try {
        const userIsValid = await validateUserById(userId, mysqlClient)
        if (!userIsValid) {
            return res.status(404).send('User is not found')
        }

        const oldFilePath = await readUserImage(userId, mysqlClient)

        const deletedUser = await mysqlQuery(/*sql*/`
            UPDATE users SET 
                emailId = CONCAT(IFNULL(emailId, ''), '-', NOW()), 
                deletedAt = NOW(), 
                deletedBy = ?
            WHERE userId = ? 
            AND deletedAt IS NULL`,
            [deletedBy, userId]
        , mysqlClient)

        if (deletedUser.affectedRows === 0) {
            return res.status(404).send('No change made')
        }

        if (oldFilePath) {
            const rootDir = path.resolve(__dirname, '../')
            const imagePath = path.join(rootDir, 'useruploads', oldFilePath)
            await deleteFile(imagePath, fs)
        }
        res.status(200).send('Deleted successfully')
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function updateUserAvatar(req, res) {
    let uploadedFilePath
    const userId = req.params.userId
    const mysqlClient = req.app.mysqlClient

    if (!['admin'].includes(req.session.user.role) && userId !== req.session.user.userId) {
        return res.status(409).send('User does not have permission to edit')
    }

    if (userId !== req.session.user.userId && req.session.user.role !== 'admin') {
        return res.status(409).send('User is not valid to edit')
    }

    if (req.file) {
        uploadedFilePath = req.file.path
    }

    try {
        const userIsValid = await validateUserById(userId, mysqlClient)
        if (!userIsValid) {
            if (uploadedFilePath) {
                await deleteFile(uploadedFilePath, fs)
            }
            return res.status(404).send('User is not found')
        }

        if (req.fileValidationError) {
           return res.status(400).send(req.fileValidationError)
        }

        sharp(fs.readFileSync(uploadedFilePath))
            .resize({
                width: parseInt(process.env.IMAGE_WIDTH),
                height: parseInt(process.env.IMAGE_HEIGHT),
                fit: sharp.fit.cover,
                position: sharp.strategy.center,
            })
            .toFile(uploadedFilePath)
        
        const pathName = path.basename(uploadedFilePath)

        const oldFilePath = await readUserImage(userId, mysqlClient)
        
        const imageUpdate =  await mysqlQuery(/*sql*/`
            UPDATE 
                users 
                SET image = ? 
            WHERE 
                userId = ? AND 
                deletedAt IS NULL`,
            [pathName, userId], mysqlClient)

        if (imageUpdate.affectedRows === 0) {
            await deleteFile(uploadedFilePath, fs)
            return res.status(204).send('Image not changed')
        }
        
        if (oldFilePath) {
            const rootDir = path.resolve(__dirname, '../')
            const imagePath = path.join(rootDir, 'useruploads', oldFilePath)
            await deleteFile(imagePath, fs)
        }

        return res.status(200).send('Image updated successfully')
    } catch (error) {
        req.log.error(error)
        return res.status(500).send(error)
    }
}

async function deleteUserAvatar(req, res) {
    const mysqlClient = req.app.mysqlClient
    const userId = req.params.userId

    if (!['admin'].includes(req.session.user.role) && userId !== req.session.user.userId) {
        return res.status(409).send('User does not have permission to delete image')
    }

    try {
        const userIsValid = await validateUserById(userId, mysqlClient)
        if (!userIsValid) {
            return res.status(404).send('User is not found to delete image')
        }

        const oldFilePath = await readUserImage(userId, mysqlClient)
        if (oldFilePath === null) {
            return res.status(404).send('Image is not found')
        }

        const deleteImage = await mysqlQuery(/*sql*/`
            UPDATE users SET image = NULL 
            WHERE userId = ? AND 
                deletedAt IS NULL`,
            [userId], mysqlClient)
        
        if (deleteImage.affectedRows === 0) {
            return res.status(204).send('User already deleted or image is not deleted')
        }

        const rootDir = path.resolve(__dirname, '../')
        const imagePath = path.join(rootDir, 'useruploads', oldFilePath)
        await deleteFile(imagePath, fs)

        res.status(200).send('Image deleted successfully')
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function changePassword(req, res) {
    const mysqlClient = req.app.mysqlClient
    const userId = req.params.userId
    const updatedBy = req.session.user.userId
    const {
        oldPassword,
        newPassword
    } = req.body

    try {
        const getExistsPassword = await mysqlQuery(/*sql*/`
            SELECT password FROM users 
            WHERE userId = ? AND 
                deletedAt IS NULL`,
            [userId], mysqlClient)
        
        if (getExistsPassword.length > 0) {
            const validatePassword = await isPasswordValid(oldPassword, getExistsPassword[0].password)
            if (validatePassword === false) {
                return res.status(400).send("Current password Invalid.")
            }
        } else {
            return res.status(404).send('User is Invalid.')
        }

        if (newPassword.length < 6) {
            return res.status(400).send('New password is Invalid.')
        } 

        const newHashGenerator = await hashPassword(newPassword)

        const updatePassword = await mysqlQuery(/*sql*/`
            UPDATE users SET 
                password = ?,
                updatedBy = ?
            WHERE userId = ? AND 
                deletedAt IS NULL`,
            [newHashGenerator, updatedBy, userId],
        mysqlClient)

        if (updatePassword.affectedRows === 0) {
            return res.status(204).send("No changes made")
        }

        res.status(200).send('Changed password successfully')
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function generateOtp(req, res) {
    const mysqlClient = req.app.mysqlClient
    const currentTime = new Date().getTime()
    const {
        emailId = null
    } = req.body

    try {
        const user = await mysqlQuery(/*sql*/`
            SELECT otpTiming FROM users 
            WHERE emailId = ? AND 
                deletedAt IS NULL`,
            [emailId], mysqlClient)

        if (user.length === 0) {
            return res.status(404).send('Invalid Email.')
        }

        const UserOtpTiming = user[0].otpTiming
        const blockedTime = new Date(UserOtpTiming).getTime()

        if (currentTime < blockedTime) {
            return res.status(401).send('User is blocked for a few hours')
        }

        var otp = otpGenerator.generate(OTP_LIMIT_NUMBER, OTP_OPTION)

        const sendOtp = await mysqlQuery(/*sql*/`
            UPDATE users SET otp = ? 
            WHERE emailId = ? AND 
                deletedAt IS NULL`,
            [otp, emailId], mysqlClient)

        if (sendOtp.affectedRows === 0) {
            return res.status(404).send('Enable to send OTP.')
        }

        const mailOptions = {
            to: emailId,
            subject: 'Password Reset OTP',
            html: `Your OTP code is <b>${otp}</b>. Please use this to complete your verification.`
        }
        await sendEmail(mailOptions)

        req.session.resetPassword = emailId
        return res.status(200).send('success')
    } catch (error) {
        console.log(error)
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function processResetPassword(req, res) {
    const mysqlClient = req.app.mysqlClient
    const emailId = req.session.resetPassword
    const { password = null, otp = null } = req.body
    const currentTime = new Date().getTime()
    const otpAttemptMax = 3

    try {
        const userDetails = await mysqlQuery(/*sql*/`
            SELECT otp, otpAttempt, otpTiming
            FROM users 
            WHERE emailId = ? AND deletedAt IS NULL`,
            [emailId],
            mysqlClient
        );

        if (userDetails.length === 0) {
            return res.status(404).send('Oops! Something went wrong. Please contact admin.')
        }

        const userOtp = userDetails[0].otp
        const userOtpAttempt = userDetails[0].otpAttempt || 0
        const userOtpTiming = userDetails[0].otpTiming

        const blockedTime = new Date(userOtpTiming).getTime()

        if (currentTime < blockedTime) {
            return res.status(401).send('Access is currently blocked. Please retry after the designated wait time.')
        }

        if (userOtpAttempt >= otpAttemptMax) {
            const updatedUser = await mysqlQuery(/*sql*/`UPDATE users SET otp = null, otpAttempt = null, otpTiming = DATE_ADD(NOW(), INTERVAL 3 HOUR)
            WHERE emailId = ? AND deletedAt IS NULL `, [emailId], mysqlClient)

            req.session.destroy(err => {
                if (err) {
                    return res.status(500).send('Error destroying session.')
                }

                if (updatedUser.affectedRows === 0) {
                    return res.status(404).send('Oops! Something went wrong. Please contact admin.')
                }
                return res.status(401).send('You are temporarily blocked. Please try again in 3 hours.')
            })
        }

        if (otp === userOtp) {
            if (password.length < 6) {
                return res.status(400).send('Password must be at least 6 characters long.')
            } 
            
            const hashGenerator = await hashPassword(password)
            const resetPassword = await mysqlQuery(/*sql*/`UPDATE users SET password = ?, otp = null,
                otpAttempt = null WHERE emailId = ? AND deletedAt IS NULL`,
                [hashGenerator, emailId], mysqlClient)

            if (resetPassword.affectedRows === 0) {
                return res.status(404).send('Oops! Something went wrong. Please contact admin.')
            }

            return res.status(200).send('success')
        } else {
            if (userOtpAttempt === 2) {
                var updateBlockedTime = await mysqlQuery(/*sql*/`UPDATE users SET otp = null, otpAttempt = null,
                otpTiming = DATE_ADD(NOW(), INTERVAL 3 HOUR) WHERE emailId = ? AND deletedAt IS NULL`,
                    [emailId], mysqlClient)

                if (updateBlockedTime.affectedRows === 0) {
                    return res.status(404).send('Oops! Something went wrong. Please contact admin.')
                }
                return res.status(401).send('You are temporarily blocked. Please try again in 3 hours.')
            } else {
                var updateOtpAttempt = await mysqlQuery(/*sql*/`UPDATE users SET otpAttempt = ? + 1
                WHERE emailId = ? AND deletedAt IS NULL`, [userOtpAttempt, emailId], mysqlClient)

                if (updateOtpAttempt.affectedRows === 0) {
                    return res.status(404).send('Oops! Something went wrong. Please contact admin.')
                }
                return res.status(400).send('Invalid OTP.')
            }
        }
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error.message)
    }
}

async function validatePayload(fileValidationError, body, isUpdate = false, userId = null, mysqlClient) {
    const errors = []
    try {
        const validateMainDetails = await validateMainPayload(body, isUpdate, userId, mysqlClient)
        if (validateMainDetails.length > 0) {
            if ('Something went wrong. Please try again later'.includes(validateMainDetails)) {
                return validateMainDetails
            }
            errors.push(...validateMainDetails)
        }

        if (fileValidationError) {
            errors.push(fileValidationError)
        }

        await userValidation.validate(body, { abortEarly: false })

    } catch (err) {
        errors.push(...err.errors)
    }
    return errors
}

async function validateMainPayload(body, isUpdate = false, userId = null, mysqlClient) {
    const { emailId } = body
    let errors = []

    try {
        await mainDetailsUserValidation.validate(body, { abortEarly: false })
    } catch (err) { 
        errors.push(...err.errors)
    }

    try {
        let query, params

        if (isUpdate) {
            query = /*sql*/`
                SELECT 
                    COUNT(*) AS count 
                FROM users 
                WHERE emailId = ? AND
                    userId != ? AND 
                    deletedAt IS NULL`
            params = [emailId, userId]
        } else {
            query = /*sql*/`
                SELECT 
                    COUNT(*) AS count 
                FROM users 
                WHERE emailId = ? AND
                    deletedAt IS NULL`
            params = [emailId]
        }

        const [validateEmailId] = await mysqlQuery(query, params, mysqlClient)

        if (validateEmailId.count > 0) {
            errors.push('Email already exists')
        }
    } catch (error) {
        return ['Something went wrong. Please try again later']
    }
    return errors
}

async function validateUserById(userId, mysqlClient) {
    const [userIsValid] = await mysqlQuery(/*sql*/`
        SELECT 
            COUNT(*) AS count 
        FROM users 
        WHERE userId = ? AND 
            deletedAt IS NULL`, 
    [userId], mysqlClient)
   
    return userIsValid.count > 0
}

async function readUserImage(userId, mysqlClient) {
    const [user] = await mysqlQuery(/*sql*/`
        SELECT image FROM users 
        WHERE userId = ? AND 
            deletedAt IS NULL`,
        [userId], mysqlClient
    )
    return user ? user.image : null 
}

module.exports = (app) => {
    app.put('/api/users/resetpassword', processResetPassword)
    app.get('/api/users/nameandrole', readUsersNameAndRole)
    app.post('/api/login', authentication)
    app.get('/api/users', readUsers)
    app.get('/api/users/:userId', readUserById)
    app.post('/api/users', multerMiddleware, createUser)
    app.put('/api/users/:userId', multerMiddleware, editUser)
    app.delete('/api/users/:userId', deleteUserById)
    app.delete('/api/users/deleteavatar/:userId', deleteUserAvatar)
    app.put('/api/users/editavatar/:userId', multerMiddleware, updateUserAvatar)
    app.post('/api/users/generateotp', generateOtp)
    app.get('/api/logout', userLogOut)
    app.put('/api/users/changepassword/:userId', changePassword)
}


