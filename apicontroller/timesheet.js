const { mysqlQuery, deleteFile } = require('../utilityclient/query')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const mime = require('mime-types') // Make sure to install this: npm install mime-types
const yup = require('yup')

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null,  path.join(__dirname, '..', 'reportdocuploads')) 
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`)
    }
})

const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'image/jpeg', 
        'image/png', 
        'image/jpg',
        'application/vnd.ms-excel', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true)
    } else {
        req.fileValidationError = 'Invalid file type. Only JPEG, PNG, JPG, and Excel (XLS/XLSX) files are allowed.'
        cb(null, false)
    }
}

const upload = multer({ storage, fileFilter })
const multerMiddleware = upload.array('reportdocuploads')

const timesheetValidation = yup.object().shape({
    projectId: yup.number()
        .integer('Project ID must be a number')
        .positive('Project ID must be positive')
        .required('Project ID is required'),

    task: yup.string()
        .min(3, 'Task must be at least 3 characters long')
        .required('Task is required'),

    hoursWorked: yup.number()
        .min(0.25, 'Hours worked must be at least 0.25')
        .max(12, 'Hours worked cannot exceed 12')
        .test(
            'is-quarter-hour', 
            'Hours worked must be in increments of 0.25 (e.g., 0.25, 0.50, 0.75, 1, 1.25, etc.)', 
            value => value % 0.25 === 0
        )
        .required('Hours worked is required'),

    workDate: yup.date()
        .typeError('Work date must be a valid date')
        .test(
            'is-today', 
            'Work date must be today', 
            value => {
                const today = new Date().setHours(0, 0, 0, 0)
                const inputDate = new Date(value).setHours(0, 0, 0, 0)
                return today === inputDate
            }
        )
        .required('Work date is required')
})

async function readTimesheets(req, res) {  
    const mysqlClient = req.app.mysqlClient
    const limit = req.query.limit ? parseInt(req.query.limit) : null
    const page = req.query.page ? parseInt(req.query.page) : null
    const offset = limit && page ? (page - 1) * limit : null
    const orderBy = req.query.orderby || 't.workDate'
    const sort = req.query.sort || 'DESC'
    const fromDate = req.query.fromDate || null
    const toDate = req.query.toDate || null
    const userId = req.query.userId || null
    const projectId = req.query.projectId || null

    let whereConditions = ["1=1"]
    let queryParameters = []

    if (userId) {
        whereConditions.push(`ur.userId = ?`)
        queryParameters.push(userId)
    }
    
    if (projectId) {
        whereConditions.push(`p.projectId = ?`)
        queryParameters.push(projectId)
    }

    if (fromDate && toDate) {
        whereConditions.push(`t.workDate BETWEEN ? AND ?`)
        queryParameters.push(fromDate, toDate)
    } else if (fromDate) {
        whereConditions.push(`t.workDate >= ?`)
        queryParameters.push(fromDate)
    } else if (toDate) {
        whereConditions.push(`t.workDate <= ?`)
        queryParameters.push(toDate)
    }

    let whereClause = `WHERE ` + whereConditions.join(' AND ')

    let timesheetsQuery = /*sql*/`
        SELECT 
            t.*,
            ur.name,
            p.projectName,
            DATE_FORMAT(t.workDate, "%d-%b-%Y") AS workedDate,
            t.hoursWorked
        FROM timesheets AS t
        LEFT JOIN users AS ur ON ur.userId = t.userId
        LEFT JOIN projects p ON p.projectId = t.projectId
        ${whereClause}
        ORDER BY ${orderBy} ${sort}`

    if (limit !== null) {
        timesheetsQuery += ' LIMIT ? OFFSET ?'
        queryParameters.push(limit, offset)
    }

    const defaultCountQuery = /*sql*/`
        SELECT COUNT(*) AS totalTimesheetCount
        FROM timesheets AS t
        LEFT JOIN users AS ur ON ur.userId = t.userId
        LEFT JOIN projects p ON p.projectId = t.projectId
        ${whereClause}`

    const totalHoursQuery = /*sql*/`
        SELECT SUM(t.hoursWorked) AS totalHours
        FROM timesheets AS t
        LEFT JOIN users AS ur ON ur.userId = t.userId
        LEFT JOIN projects p ON p.projectId = t.projectId
        ${whereClause}`

    try {
        const [timesheets, defaultCount, totalHours] = await Promise.all([
            mysqlQuery(timesheetsQuery, queryParameters, mysqlClient),
            mysqlQuery(defaultCountQuery, queryParameters, mysqlClient),
            mysqlQuery(totalHoursQuery, queryParameters, mysqlClient)
        ])

        function adjustHours(value) {
            const adjustments = {
                1.25: 1.15, 1.50: 1.30, 1.75: 1.45, 2.00: 2.00,
                8.25: 8.15, 8.50: 8.30, 8.75: 8.45, 9.00: 9.00
            }
            return adjustments[value] !== undefined ? adjustments[value] : value
        }

        const updatedTimesheets = timesheets.map(row => ({
            ...row,
            hoursWorked: adjustHours(row.hoursWorked)
        }))

        let adjustedTotalHours = adjustHours(totalHours[0].totalHours || 0)

        res.status(200).json({
            timesheets: updatedTimesheets,
            totalTimesheetCount: defaultCount[0].totalTimesheetCount,
            totalAdjustedHoursWorked: adjustedTotalHours
        })

    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

// async function createTimesheet(req, res) {
//     const mysqlClient = req.app.mysqlClient
//     const { timesheets } = req.body
//     const userId = req.session.user.userId
//     const uploadedFiles = Array.isArray(req.files) ? req.files : []

//     if (req.body.userId && req.body.userId !== userId) {
//         for (const file of uploadedFiles) {
//             await deleteFile(file.path, fs)
//         }
//         return res.status(403).json('User not valid')
//     }

//     if (!['hr', 'employee'].includes(req.session.user.role)) {
//         for (const file of uploadedFiles) {
//             await deleteFile(file.path, fs)
//         }
//         return res.status(403).json('Unauthorized access')
//     }

//     try {
//         const parsedTimesheets = JSON.parse(timesheets)
    
//         const insertedIds = []
//         const movedFiles = []

//         for (let i = 0; i < parsedTimesheets.length; i++) {
//             const timesheet = parsedTimesheets[i]
//             const file = uploadedFiles[i]

//             await timesheetValidation.validate(timesheet, { abortEarly: false })

//             if (file && file.size > 5 * 1024 * 1024) {
//                 throw new Error(`File size exceeds 5MB for record ${i + 1}`)
//             }

//             const { projectId, task, hoursWorked, workDate } = timesheet;
//             const insertResult = await mysqlQuery(/*sql*/`
//                 INSERT INTO timesheets (projectId, userId, task, hoursWorked, workDate)
//                 VALUES (?, ?, ?, ?, ?)`,
//                 [projectId, userId, task, hoursWorked, workDate], mysqlClient
//             )

//             if (insertResult.affectedRows === 0) {
//                 throw new Error(`Insert failed for record ${i + 1}`)
//             }

//             const timesheetId = insertResult.insertId
//             insertedIds.push(timesheetId)

//             if (file) {
//                 const originalDir = path.dirname(file.path)
//                 const ext = path.extname(file.originalname)
//                 const filename = `${timesheetId}_${Date.now()}${ext}`
//                 const newPath = path.join(originalDir, filename)

//                 await new Promise((resolve, reject) => {
//                     fs.rename(file.path, newPath, (err) => {
//                         if (err) return reject(err)
//                         movedFiles.push(newPath)
//                         resolve()
//                     })
//                 })

//                 const updateResult = await mysqlQuery(/*sql*/`
//                     UPDATE timesheets SET documentImage = ? WHERE timesheetId = ?`,
//                     [filename, timesheetId], mysqlClient
//                 )

//                 if (updateResult.affectedRows === 0) {
//                     throw new Error(`Image update failed for record ${i + 1}`)
//                 }
//             }
//         }

//         res.status(200).json('Successfully submitted...')

//     } catch (error) {
//         for (const file of uploadedFiles) {
//             if (file?.path) await deleteFile(file.path, fs)
//         }
//     console.log(error)
//         req.log.error(error)
//         res.status(500).json(error)
//     } 
// }

async function createTimesheet(req, res) {
    const mysqlClient = req.app.mysqlClient
    const { timesheets } = req.body
    const userId = req.session.user.userId
    const role = req.session.user.role
    const uploadedFiles = Array.isArray(req.files) ? req.files : []
    console.log(uploadedFiles)

    const insertedIds = []
    const movedFiles = []

    // 1. User validation
    if (req.body.userId && req.body.userId !== userId) {
        await Promise.all(uploadedFiles.map(file => deleteFile(file.path, fs)))
        return res.status(403).json({ message: 'User not valid' })
    }

    if (!['hr', 'employee'].includes(role)) {
        await Promise.all(uploadedFiles.map(file => deleteFile(file.path, fs)))
        return res.status(403).json({ message: 'Unauthorized access' })
    }

    try {
        // 2. Parse timesheet data
        const parsedTimesheets = JSON.parse(timesheets)

        for (let i = 0; i < parsedTimesheets.length; i++) {
            const timesheet = parsedTimesheets[i]
            const file = uploadedFiles[i]

            // 3. Validation
            try {
                await timesheetValidation.validate(timesheet, { abortEarly: false })
            } catch (validationErr) {
                throw new Error(`Validation failed at record ${i + 1}: ${validationErr.errors.join(', ')}`)
            }

            // 4. File size check
            if (file && file.size > 5 * 1024 * 1024) {
                throw new Error(`File size exceeds 5MB at record ${i + 1}`)
            }

            const { projectId, task, hoursWorked, workDate } = timesheet

            // 5. Insert into DB
            const insertResult = await mysqlQuery(/*sql*/`
                INSERT INTO timesheets (projectId, userId, task, hoursWorked, workDate)
                VALUES (?, ?, ?, ?, ?)`,
                [projectId, userId, task, hoursWorked, workDate],
                mysqlClient
            )

            if (insertResult.affectedRows === 0) {
                throw new Error(`Insert failed at record ${i + 1}`)
            }

            const timesheetId = insertResult.insertId
            insertedIds.push(timesheetId)

            // 6. Save uploaded file
            if (file) {
                const ext = path.extname(file.originalname)
                const filename = `${timesheetId}_${Date.now()}${ext}`
                const newPath = path.join(path.dirname(file.path), filename)

                await new Promise((resolve, reject) => {
                    fs.rename(file.path, newPath, err => {
                        if (err) return reject(err)
                        movedFiles.push(newPath)
                        resolve()
                    })
                })

                // 7. Update DB with image name
                const updateResult = await mysqlQuery(/*sql*/`
                    UPDATE timesheets SET documentImage = ? WHERE timesheetId = ?`,
                    [filename, timesheetId],
                    mysqlClient
                )

                if (updateResult.affectedRows === 0) {
                    throw new Error(`Image update failed at record ${i + 1}`)
                }
            }
        }

        // 8. Success
        res.status(200).json({
            message: 'Successfully submitted',
            insertedIds
        })

    } catch (error) {
        // 9. Delete uploaded temp files
        for (const file of uploadedFiles) {
            if (file?.path && fs.existsSync(file.path)) {
                await deleteFile(file.path, fs)
            }
        }

        // 10. Rollback DB records
        if (insertedIds.length > 0) {
            await mysqlQuery(
                `DELETE FROM timesheets WHERE timesheetId IN (${insertedIds.map(() => '?').join(',')})`,
                insertedIds,
                mysqlClient
            )
        }

        // 11. Delete moved files
        for (const filePath of movedFiles) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
            }
        }

        req.log?.error?.(error)
        res.status(500).json({ message: error.message || 'Something went wrong' })
    }
}

async function readTimeSheetDocumentById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const timesheetId = req.params.timesheetId

    try {
        const [docImage] = await mysqlQuery(/*sql*/`
            SELECT documentImage FROM timesheets 
            WHERE timesheetId = ?`,
            [timesheetId], mysqlClient)

        const fileName = docImage?.documentImage
        if (!fileName) {
            return res.status(404).json("No document found for this timesheet")
        }

        const baseDir = path.join(__dirname, '..', 'reportdocuploads')
        const filePath = path.join(baseDir, fileName)

        if (!fs.existsSync(filePath)) {
            return res.status(404).json("File does not exist")
        }

        const mimeType = mime.lookup(filePath) || 'application/octet-stream'
        res.setHeader('Content-Type', mimeType)
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)

        fs.createReadStream(filePath).pipe(res)
    } catch (error) {
        req.log.error(error)
        res.status(500).json("Internal server error")
    }
}

module.exports = (app) => {
    app.get('/api/timesheets', readTimesheets)
    app.post('/api/timesheets', multerMiddleware, createTimesheet)
    app.get('/api/timesheets/documentimage/:timesheetId', readTimeSheetDocumentById)
}
