const { mysqlQuery, deleteFile,hashPassword, isPasswordValid } = require("../utilityclient/query")
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const yup = require('yup')
const { subYears } = require('date-fns')

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
        .oneOf(['admin', 'employee', 'manager', 'hr'], 'Role is invalid') // Add more roles if needed
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
            SELECT * FROM users 
            WHERE emailId = ? AND 
                deletedAt IS NULL`,
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
        req.log.error(error)
        res.status(500).send(error.message)
    }
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

    try {
        const [user] = await mysqlQuery(/*sql*/`
            SELECT 
                u.*,
                ur.name AS createdName,
                DATE_FORMAT(u.dob, "%d-%b-%Y %r") AS birth,
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

async function createUser(req, res) {
    const mysqlClient = req.app.mysqlClient
    let uploadedFilePath
    const {
        name, 
        dob, 
        emailId, 
        password, 
        role, 
        status
    } = req.body    
    const createdBy = req.session.user.userId

    try {
        const validationErrors = await validatePayload(req.fileValidationError, req.body, false, null, mysqlClient)
        if (validationErrors.length > 0) {
            if (req.file !== undefined) {
                uploadedFilePath = req.file.path
                await deleteFile(uploadedFilePath, fs)
            }
            return res.status(400).send(validationErrors)
        }

        if (req.file !== undefined){
            uploadedFilePath = req.file.path
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

    ALLOWED_UPDATE_KEYS.forEach((key) => {
        keyValue = req.body[key]
        if (keyValue !== undefined) {
            values.push(keyValue)
            updates.push(` ${key} = ?`)
        }
    })

    updates.push('updatedBy = ?')
    values.push(updatedBy, userId)

    try {
        const userIsValid = await validateUserById(userId, mysqlClient)
        if (userIsValid.count === 0) {
            return res.status(404).send(userIsValid)
        }

        const validUpdate = await validatePayload(req.fileValidationError, req.body, true, userId, mysqlClient)
        if (validUpdate.length > 0) {
            return res.status(400).send(validUpdate)
        }

        const [user] = await mysqlQuery(/*sql*/`
            SELECT image FROM users WHERE userId = ? AND deletedAt IS NULL`,
            [userId], mysqlClient)

        let oldFilePath = user.image  

        const updateUser = await mysqlQuery(/*sql*/`
            UPDATE 
                users SET ${updates.join(', ')} 
            WHERE userId = ? AND 
                deletedAt IS NULL`,
            values, mysqlClient)

        if (updateUser.affectedRows === 0) {
            return res.status(204).send('No changes made')
        }

        if (req.file) {
            uploadedFilePath = req.file.path
            await sharp(fs.readFileSync(uploadedFilePath))
                .resize({
                    width: parseInt(process.env.IMAGE_WIDTH),
                    height: parseInt(process.env.IMAGE_HEIGHT),
                    fit: sharp.fit.cover,
                    position: sharp.strategy.center,
                })
                .toFile(uploadedFilePath)

            const originalDir = path.dirname(uploadedFilePath)
            const filename = `${userId}_${Date.now()}.jpg`
            const newFilePath = path.join(originalDir, filename)

            fs.rename(originalDir, newFilePath, async (err) => {
                if (err) {
                    await deleteFile(originalDir, fs)
                    return res.status(400).send('Error renaming file')
                }
            })

            const image =  await mysqlQuery(/*sql*/`
                UPDATE 
                    users 
                    SET image = ? 
                WHERE 
                    userId = ? AND 
                    deletedAt IS NULL`,
                [uploadedFilePath, userId], mysqlClient)

            if (image.affectedRows === 0) {
                return res.status(204).send('Image not changed')
            }

            if (oldFilePath !== undefined) {
                console.log('deleted')
                deleteFile(oldFilePath, fs)
            }
        }

        res.status(200).send('Successfully updated.')
    } catch (error) {
        console.log(error)
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
    const userIsValid = await mysqlQuery(/*sql*/`
        SELECT 
            COUNT(*) AS count 
        FROM users 
        WHERE userId = ? AND 
            deletedAt IS NULL`, 
    [userId], mysqlClient)

    if (userIsValid.count === 0) {
        return userIsValid
    }
    return []
    
}

async function processAndRenameImage(filePath, userId) {
    try {
        await sharp(fs.readFileSync(filePath))
            .resize({
                width: parseInt(process.env.IMAGE_WIDTH),
                height: parseInt(process.env.IMAGE_HEIGHT),
                fit: sharp.fit.cover,
                position: sharp.strategy.center,
            })
            .toFile(filePath)

        const originalDir = path.dirname(filePath)
        const filename = `${userId}_${Date.now()}.jpg`
        const newFilePath = path.join(originalDir, filename)

        return new Promise((resolve, reject) => {
            fs.rename(filePath, newFilePath, (err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(newFilePath)
                }
            })
        })
    } catch (error) {
        throw error
    }
}

module.exports = (app) => {
    app.post('/api/login', authentication)
    app.get('/api/users', readUsers)
    app.get('/api/users/:userId', readUserById)
    app.post('/api/users', multerMiddleware, createUser)
    app.put('/api/users/:userId', multerMiddleware, editUser)

}


