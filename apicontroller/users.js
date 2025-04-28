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
        .max(subYears(new Date(), 18), 'DOB must be at least 18 years old')
        .required('DOB is required'),
    emailId: yup.string().email('Invalid email format').required('Email is required'),
})

const baseUserValidation = yup.object().shape({
    role: yup
        .string()
        .oneOf(['admin', 'employee', 'manager', 'hr'], 'Role is invalid') 
        .required('Role is required'),

    status: yup
        .number()
        .oneOf([0, 1], 'Status is invalid')
        .required('Status is required'),
})

const passwordValidation = yup.object().shape({
    password: yup
        .string()
        .min(6, 'Password must be at least 6 characters long')
        .matches(/[\W_]/, 'Password must contain at least one special character')
        .required('Password is required'),
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
            return res.status(400).json('Invalid Email or Password.')
        }

        if (user.status !== 1) {
            req.session.isLogged = false
            req.session.user = null
            return res.status(400).json('User is not active. Contact admin.')
        }

        const isValid = await isPasswordValid(password, user.password)

        if (isValid) {
            req.session.user = user
            req.session.isLogged = true
            res.status(200).json(user)
        } else {
            req.session.isLogged = false
            req.session.user = null
            res.status(400).json('Invalid Email or Password.')
        }
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

function userLogOut(req, res) {
    req.session.destroy((err) => {
        if (err) logger.error()
        // res.redirect('/login')
        return res.status(200).json('Logout successfully')
    })
}

async function readUsers(req, res) {
    const mysqlClient = req.app.mysqlClient
    const limit = req.query.limit ? parseInt(req.query.limit) : null
    const page = req.query.page ? parseInt(req.query.page) : null
    const offset = limit && page ? (page - 1) * limit : null
    const orderBy = req.query.orderby
    const sort = req.query.sort
    const rawSearch = req.query.search
  
    const lowerSearch = rawSearch?.toLowerCase()
    const isStatusSearch = lowerSearch === 'active' || lowerSearch === 'inactive'
    const searchQuery = isStatusSearch
      ? lowerSearch === 'active' ? 1 : 0
      : rawSearch || ''
    const searchPattern = `%${searchQuery}%`
  
    if (!['admin'].includes(req.session.user.role)) {
      return res.status(409).json('User does not have permission to view')
    }
  
    let usersQuery = /*sql*/`
      SELECT 
          u.*,
          ur.name AS createdName
      FROM users AS u
      LEFT JOIN users AS ur ON ur.userId = u.createdBy
      WHERE 
          u.deletedAt IS NULL AND 
          ${isStatusSearch
            ? `u.status = ?`
            : `(u.name LIKE ? OR u.emailId LIKE ? OR u.role LIKE ? OR ur.name LIKE ?)`}
      ORDER BY ${orderBy} ${sort}`
  
    let countQuery = /*sql*/`
      SELECT
          COUNT(*) AS totalUserCount
      FROM 
          users AS u
      LEFT JOIN users AS ur ON ur.userId = u.createdBy
      WHERE 
          u.deletedAt IS NULL AND
          ${isStatusSearch
            ? `u.status = ?`
            : `(u.name LIKE ? OR u.emailId LIKE ? OR u.role LIKE ? OR ur.name LIKE ?)`}
      ORDER BY ${orderBy} ${sort}`
  
    let queryParameters, countQueryParameters
  
    if (isStatusSearch) {
      queryParameters = [searchQuery]
      countQueryParameters = [searchQuery]
      if (limit >= 0) {
        usersQuery += ' LIMIT ? OFFSET ?'
        queryParameters.push(limit, offset)
      }
    } else {
      queryParameters = [searchPattern, searchPattern, searchPattern, searchPattern]
      countQueryParameters = [...queryParameters]
      if (limit >= 0) {
        usersQuery += ' LIMIT ? OFFSET ?'
        queryParameters.push(limit, offset)
      }
    }
  
    try {
      const [users, totalCount] = await Promise.all([
        mysqlQuery(usersQuery, queryParameters, mysqlClient),
        mysqlQuery(countQuery, countQueryParameters, mysqlClient)
      ])
  
      res.status(200).json({
        users: users,
        userCount: totalCount[0].totalUserCount
      })
  
    } catch (error) {
      req.log.error(error)
      res.status(500).json(error)
    }
}
  

async function readUserById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const userId = req.params.userId

    if (!['admin'].includes(req.session.user.role)) {
        return res.status(409).json('User does not have permission to view')
    }

    try {
        const userIsValid = await validateUserById(userId, mysqlClient)
        if (!userIsValid) {
            return res.status(404).json('User is not found')
        }

        const user = await mysqlQuery(/*sql*/`
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
            
        res.status(200).json(user)
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}


async function readUserAvatarById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const userId = req.params.userId
    try {
        const [userImage] = await mysqlQuery(/*sql*/`
            SELECT image FROM users WHERE deletedAt IS NULL AND userId = ?`,
            [userId], mysqlClient)
            
        const fileName = userImage?.image || 'default.jpg'
        
        const baseDir = path.join(__dirname, '..', 'useruploads')
        const imagePath = path.join(baseDir, fileName)
        const defaultImagePath = path.join(baseDir, 'default.jpg')

        const imageToServe = fs.existsSync(imagePath) ? imagePath : defaultImagePath
        res.setHeader('Content-Type', 'image/jpeg')
        fs.createReadStream(imageToServe).pipe(res)
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

// async function readUsersNameAndRole(req, res) {
//     const mysqlClient = req.app.mysqlClient
//     const adminAndManager = req.query.adminAndManager === 'true'
//     const project = req.query.project
    
//     try {
//         let userDetails = /*sql*/`
//             SELECT userId, name, role FROM users
//             WHERE deletedAt IS NULL AND
//                 status = 1 AND`

//         if (adminAndManager) {
//             userDetails += " (role = 'admin' OR role = 'manager')"
            
//         } else {
//             userDetails += " (role = 'hr' OR role = 'employee')"
//         }
//         let queryParameters = []


//         if (project) {
//             userDetails += " AND userId = ?"
//             queryParameters.push(userId)
//         }

//         userDetails += " ORDER BY name ASC"
        


//         const nameAndRole = await mysqlQuery(userDetails, queryParameters, mysqlClient)
//         return res.status(200).json(nameAndRole)
//     } catch (error) {
//         req.log.error(error)    
//         res.status(500).json(error)
//     }
// }

async function readUsersNameAndRole(req, res) {
    const mysqlClient = req.app.mysqlClient
    const adminAndManager = req.query.adminAndManager === 'true'
    const projectId = req.query.projectId || ''
    const deleted = req.query.deleted === 'true'

    try {
        let userDetails = /*sql*/`
            SELECT DISTINCT u.userId, u.name, u.role 
            FROM users u`
        
        const queryParameters = []
        const conditions = ['u.status = 1']
        if (deleted) {
            conditions.push('u.deletedAt IS NULL')
        }

        // Join and add project-related condition if projectId is provided
        if (projectId) {
            userDetails += `
                INNER JOIN projectEmployees pe ON pe.employeeId = u.userId 
                AND pe.projectId = ?`
            conditions.push('pe.deletedAt IS NULL')
            queryParameters.push(projectId)
        }

        // Role filter
        if (adminAndManager) {
            conditions.push(`(u.role = 'admin' OR u.role = 'manager')`)
        } else {
            conditions.push(`(u.role = 'hr' OR u.role = 'employee')`)
        }

        // Final WHERE and ORDER
        userDetails += `
            WHERE ${conditions.join(' AND ')} 
            ORDER BY u.name ASC`

        const nameAndRole = await mysqlQuery(userDetails, queryParameters, mysqlClient)
        
        if (nameAndRole.length === 0) {
            return res.status(404).json('No users found or project not found')
        }

        return res.status(200).json(nameAndRole)
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
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
        return res.status(409).json('User does not have permission to create')
    }

    try {
        const validationErrors = await validatePayload(req.fileValidationError, req.body, false, null, mysqlClient)
        if (validationErrors.length > 0) {
            if (uploadedFilePath) {
                await deleteFile(uploadedFilePath, fs)
            }
            return res.status(400).json(validationErrors)
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
            return res.status(400).json('No insert was made')
        }

        if (uploadedFilePath) {
            const originalDir = path.dirname(uploadedFilePath)
            const filename = `${newUser.insertId}_${Date.now()}.jpg`
            const newFilePath = path.join(originalDir, filename)

            fs.rename(uploadedFilePath, newFilePath, async (err) => {
                if (err) {
                    await deleteFile(uploadedFilePath, fs)
                    return res.status(400).json('Error renaming file')
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
                return res.status(400).json('Image is not set')
            }
        }

        res.status(201).json('Successfully created...')
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
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
        return res.status(409).json('User does not have permission to edit')
    }
    try {
        const oldFilePath = await readUserImage(userId, mysqlClient)

        const userIsValid = await validateUserById(userId, mysqlClient)
        if (!userIsValid) {
            if (req.file?.path && req.file.path !== oldFilePath) {
                await deleteFile(req.file.path, fs)
            }
            return res.status(404).json('User is not found')
        }

        ALLOWED_UPDATE_KEYS.forEach((key) => {
            const keyValue = req.body[key]
            if (keyValue !== undefined) {
                updates.push(`${key} = ?`)
                values.push(keyValue)
            }
        })

        updates.push('updatedBy = ?')
        values.push(updatedBy, userId)

        if (req.file) {
            uploadedFilePath = req.file.path
        } else if (req.body.removeImage === true) {
            const deleteImage = await mysqlQuery(/*sql*/`
                UPDATE users SET image = NULL 
                WHERE userId = ? AND deletedAt IS NULL`,
                [userId],
                mysqlClient
            )

            if (deleteImage.affectedRows === 0) {
                return res.status(204).json('Image is not deleted')
            }

            if (oldFilePath) {
                const imagePath = path.resolve(__dirname, '../useruploads', oldFilePath)
                await deleteFile(imagePath, fs)
            }
        }

        const validationErrors = await validatePayload(req.fileValidationError, req.body, true, userId, mysqlClient)
        if (validationErrors.length > 0) {
            if (uploadedFilePath && uploadedFilePath !== oldFilePath) {
                await deleteFile(uploadedFilePath, fs)
            }
            return res.status(400).json(validationErrors)
        }

        const passwordIndex = ALLOWED_UPDATE_KEYS.indexOf('password')
        if (passwordIndex >= 0 && req.body.password) {
            values[passwordIndex] = md5(req.body.password)
        }

        const updateUser = await mysqlQuery(/*sql*/`
            UPDATE users SET ${updates.join(', ')} 
            WHERE userId = ? AND deletedAt IS NULL`,
            values,
            mysqlClient
        )

        if (updateUser.affectedRows === 0) {
            if (uploadedFilePath && uploadedFilePath !== oldFilePath) {
                await deleteFile(uploadedFilePath, fs)
            }
            return res.status(204).json('No changes made')
        }

        if (uploadedFilePath && uploadedFilePath !== oldFilePath) {
            await sharp(fs.readFileSync(uploadedFilePath))
                .resize({
                    width: parseInt(process.env.IMAGE_WIDTH),
                    height: parseInt(process.env.IMAGE_HEIGHT),
                    fit: sharp.fit.cover,
                    position: sharp.strategy.center
                })
                .toFile(uploadedFilePath)

            const fileName = path.basename(uploadedFilePath)
            const imageUpdate = await mysqlQuery(/*sql*/`
                UPDATE users SET image = ? 
                WHERE userId = ? AND deletedAt IS NULL`,
                [fileName, userId],
                mysqlClient
            )

            if (imageUpdate.affectedRows === 0) {
                await deleteFile(uploadedFilePath, fs)
                return res.status(204).json('Image not changed')
            }

            if (oldFilePath) {
                const imagePath = path.resolve(__dirname, '../useruploads', oldFilePath)
                await deleteFile(imagePath, fs)
            }
        }

        res.status(200).json('Successfully updated...')
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

async function deleteUserById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const userId = req.params.userId
    const deletedBy = req.session.user.userId

    if (!['admin'].includes(req.session.user.role) && userId !== req.session.user.userId) {
        return res.status(409).json('User does not have permission to delete')
    }

    try {
        const userIsValid = await validateUserById(userId, mysqlClient)
        if (!userIsValid) {
            return res.status(404).json('User is not found')
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
            return res.status(404).json('No change made')
        }

        if (oldFilePath) {
            const rootDir = path.resolve(__dirname, '../')
            const imagePath = path.join(rootDir, 'useruploads', oldFilePath)
            await deleteFile(imagePath, fs)
        }
        res.status(200).json('Deleted successfully')
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

async function updateUserAvatar(req, res) {
    let uploadedFilePath
    const userId = req.params.userId
    const mysqlClient = req.app.mysqlClient

    if (!['admin'].includes(req.session.user.role) && userId !== req.session.user.userId) {
        return res.status(409).json('User does not have permission to edit')
    }

    if (userId !== req.session.user.userId && req.session.user.role !== 'admin') {
        return res.status(409).json('User is not valid to edit')
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
            return res.status(404).json('User is not found')
        }

        if (req.fileValidationError) {
           return res.status(400).json(req.fileValidationError)
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
            return res.status(204).json('Image not changed')
        }
        
        if (oldFilePath) {
            const rootDir = path.resolve(__dirname, '../')
            const imagePath = path.join(rootDir, 'useruploads', oldFilePath)
            await deleteFile(imagePath, fs)
        }

        return res.status(200).json('Image updated successfully')
    } catch (error) {
        req.log.error(error)
        return res.status(500).json(error)
    }
}

async function deleteUserAvatar(req, res) {
    const mysqlClient = req.app.mysqlClient
    const userId = req.params.userId

    if (!['admin'].includes(req.session.user.role) && userId !== req.session.user.userId) {
        return res.status(409).json('User does not have permission to delete image')
    }

    try {
        const userIsValid = await validateUserById(userId, mysqlClient)
        if (!userIsValid) {
            return res.status(404).json('User is not found to delete image')
        }

        const oldFilePath = await readUserImage(userId, mysqlClient)
        if (oldFilePath === null) {
            return res.status(404).json('Image is not found')
        }

        const deleteImage = await mysqlQuery(/*sql*/`
            UPDATE users SET image = NULL 
            WHERE userId = ? AND 
                deletedAt IS NULL`,
            [userId], mysqlClient)
        
        if (deleteImage.affectedRows === 0) {
            return res.status(204).json('User already deleted or image is not deleted')
        }

        const rootDir = path.resolve(__dirname, '../')
        const imagePath = path.join(rootDir, 'useruploads', oldFilePath)
        await deleteFile(imagePath, fs)

        res.status(200).json('Image deleted successfully')
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
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
                return res.status(400).json("Current password Invalid.")
            }
        } else {
            return res.status(404).json('User is Invalid.')
        }

        if (newPassword.length < 6) {
            return res.status(400).json('New password is Invalid.')
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
            return res.status(204).json("No changes made")
        }

        res.status(200).json('Changed password successfully')
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
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
            return res.status(404).json('Invalid Email.')
        }

        const UserOtpTiming = user[0].otpTiming
        const blockedTime = new Date(UserOtpTiming).getTime()

        if (currentTime < blockedTime) {
            return res.status(401).json('User is blocked for a few hours')
        }

        var otp = otpGenerator.generate(OTP_LIMIT_NUMBER, OTP_OPTION)

        const sendOtp = await mysqlQuery(/*sql*/`
            UPDATE users SET otp = ? 
            WHERE emailId = ? AND 
                deletedAt IS NULL`,
            [otp, emailId], mysqlClient)

        if (sendOtp.affectedRows === 0) {
            return res.status(404).json('Enable to send OTP.')
        }

        const mailOptions = {
            to: emailId,
            subject: 'Password Reset OTP',
            html: `Your OTP code is <b>${otp}</b>. Please use this to complete your verification.`
        }
        await sendEmail(mailOptions)

        req.session.resetPassword = emailId
        return res.status(200).json('success')
    } catch (error) {
        console.log(error)
        req.log.error(error)
        res.status(500).json(error)
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
            return res.status(404).json('Oops! Something went wrong. Please contact admin.')
        }

        const userOtp = userDetails[0].otp
        const userOtpAttempt = userDetails[0].otpAttempt || 0
        const userOtpTiming = userDetails[0].otpTiming

        const blockedTime = new Date(userOtpTiming).getTime()

        if (currentTime < blockedTime) {
            return res.status(401).json('Access is currently blocked. Please retry after the designated wait time.')
        }

        if (userOtpAttempt >= otpAttemptMax) {
            const updatedUser = await mysqlQuery(/*sql*/`UPDATE users SET otp = null, otpAttempt = null, otpTiming = DATE_ADD(NOW(), INTERVAL 3 HOUR)
            WHERE emailId = ? AND deletedAt IS NULL `, [emailId], mysqlClient)

            req.session.destroy(err => {
                if (err) {
                    return res.status(500).json('Error destroying session.')
                }

                if (updatedUser.affectedRows === 0) {
                    return res.status(404).json('Oops! Something went wrong. Please contact admin.')
                }
                return res.status(401).json('You are temporarily blocked. Please try again in 3 hours.')
            })
        }

        if (otp === userOtp) {
            if (password.length < 6) {
                return res.status(400).json('Password must be at least 6 characters long.')
            } 
            
            const hashGenerator = await hashPassword(password)
            const resetPassword = await mysqlQuery(/*sql*/`UPDATE users SET password = ?, otp = null,
                otpAttempt = null WHERE emailId = ? AND deletedAt IS NULL`,
                [hashGenerator, emailId], mysqlClient)

            if (resetPassword.affectedRows === 0) {
                return res.status(404).json('Oops! Something went wrong. Please contact admin.')
            }

            return res.status(200).json('success')
        } else {
            if (userOtpAttempt === 2) {
                var updateBlockedTime = await mysqlQuery(/*sql*/`UPDATE users SET otp = null, otpAttempt = null,
                otpTiming = DATE_ADD(NOW(), INTERVAL 3 HOUR) WHERE emailId = ? AND deletedAt IS NULL`,
                    [emailId], mysqlClient)

                if (updateBlockedTime.affectedRows === 0) {
                    return res.status(404).json('Oops! Something went wrong. Please contact admin.')
                }
                return res.status(401).json('You are temporarily blocked. Please try again in 3 hours.')
            } else {
                var updateOtpAttempt = await mysqlQuery(/*sql*/`UPDATE users SET otpAttempt = ? + 1
                WHERE emailId = ? AND deletedAt IS NULL`, [userOtpAttempt, emailId], mysqlClient)

                if (updateOtpAttempt.affectedRows === 0) {
                    return res.status(404).json('Oops! Something went wrong. Please contact admin.')
                }
                return res.status(400).json('Invalid OTP.')
            }
        }
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error.message)
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

        try {
            await baseUserValidation.validate(body, { abortEarly: false })
        } catch (err) {
            errors.push(...err.errors)
        }

        if (!isUpdate) {
            try {
                await passwordValidation.validate(body, { abortEarly: false })
            } catch (err) {
                errors.push(...err.errors)
            }
        }

    } catch (err) {
        errors.push(...err.errors)
    }
    return errors
}

async function validateMainPayload(body, isUpdate = false, userId = null, mysqlClient) {
    const { emailId, name } = body
    let errors = []

    try {
        let emailQuery, emailParams, nameQuery, nameParams

        if (isUpdate) {
            emailQuery = /*sql*/`
                SELECT 
                    COUNT(*) AS count 
                FROM users 
                WHERE emailId = ? AND
                    userId != ? AND 
                    deletedAt IS NULL`
            emailParams = [emailId, userId]
        } else {
            emailQuery = /*sql*/`
                SELECT 
                    COUNT(*) AS count 
                FROM users 
                WHERE emailId = ? AND
                    deletedAt IS NULL`
            emailParams = [emailId]
        }

        if (isUpdate) {
            nameQuery = /*sql*/`
                SELECT 
                    COUNT(*) AS count 
                FROM users 
                WHERE name = ? AND
                    userId != ? AND 
                    deletedAt IS NULL`
            nameParams = [name, userId]
        } else {
            nameQuery = /*sql*/`
                SELECT 
                    COUNT(*) AS count 
                FROM users 
                WHERE name = ? AND
                    deletedAt IS NULL`
            nameParams = [name]
        }

        const [validateName] = await mysqlQuery(nameQuery, nameParams, mysqlClient)
        const [validateEmailId] = await mysqlQuery(emailQuery, emailParams, mysqlClient)

        if (validateName.count > 0) {
            errors.push('Name already exists')
        }

        if (validateEmailId.count > 0) {
            errors.push('Email already exists')
        }
    } catch (error) {
        return ['Something went wrong. Please try again later']
    }

    try {
        await mainDetailsUserValidation.validate(body, { abortEarly: false })
    } catch (err) { 
        errors.push(...err.errors)
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
    app.get('/api/users/avatar/:userId', readUserAvatarById)
    app.get('/api/users/nameandrole', readUsersNameAndRole)
    app.put('/api/users/resetpassword', processResetPassword)
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


