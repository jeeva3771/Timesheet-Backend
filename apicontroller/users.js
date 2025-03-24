const { mysqlQuery, deleteFile } = require("../utilityclient/query")
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', 'useruploads'))
    },
    filename: function (req, file, cb) {
        const wardenId = req.params.wardenId
        cb(null, `${wardenId}.jpg`)
    }
})

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/jpeg') {
        cb(null, true)
    } else {
        req.fileValidationError = 'Invalid file type. Only JPEG files are allowed.'
        cb(null, false)
    }
};

const upload = multer({ storage, fileFilter })
const multerMiddleware = upload.single('image')

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
        // const validationErrors = await validatePayload(req.body, false, null, mysqlClient);
        // if (validationErrors.length > 0) {
        //     return res.status(400).send(validationErrors)
        // }

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

        const newUser = await mysqlQuery(/*sql*/`
            INSERT INTO users 
                (name, dob, emailId, password, role, status, createdBy)
            values(?, ?. ?, ?, ?, ?, ?)`,
            [name, dob, emailId, password, role, status, createdBy], mysqlClient)
        
        if (newWarden.affectedRows === 0) {
            await deleteFile(uploadedFilePath, fs)
            return res.status(400).send('No insert was made')
        }

        if (uploadedFilePath && newUser.length > 0) {
            const originalDir = path.dirname(uploadedFilePath);
            const newFilePath = path.join(originalDir, `${newUser.insertId}_${new Date}.jpg`)

            fs.rename(uploadedFilePath, newFilePath, (err) => {
                if (err) {
                    return res.status(400).send('Error renaming file')
                }
            })

            const image = await mysqlQuery(/*sql*/`
                UPDATE 
                    user 
                    SET image = ? 
                WHERE 
                    userId = ? AND 
                    deletedAt IS NULL`,
                [newFilePath, newUser.insertId], mysqlClient)
            
            if (image.affectedRows === 0) {
                return res.status(400).send('Image is not set')
            }
        }

        res.status(201).send('Successfully created.')
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

module.exports = (app) => {
    app.get('/api/users', readUsers)
    app.get('/api/user/:userId', readUserById)
    app.post('/api/user',multerMiddleware, createUser)
}


