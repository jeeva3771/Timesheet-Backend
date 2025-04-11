const { mysqlQuery, deleteFile } = require('../utilityclient/query')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const yup = require('yup')
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, path.join(__dirname, '..', 'reportdocuploads'))
//     },
//     filename: function (req, file, cb) {
//         const userId = req.params.userId
//         const fileExtension = path.extname(file.originalname)
//         cb(null, `${userId}_${Date.now()}${fileExtension}`)
//     }
// })

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
    const name = req.query.name || null
    const projectName = req.query.projectName || null

    let whereConditions = ["1=1"]
    let queryParameters = []

    if (name) {
        whereConditions.push(`ur.name = ?`)
        queryParameters.push(name)
    }
    
    if (projectName) {
        whereConditions.push(`p.projectName = ?`)
        queryParameters.push(projectName)
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

        res.status(200).send({
            timesheets: updatedTimesheets,
            totalTimesheetCount: defaultCount[0].totalTimesheetCount,
            totalAdjustedHoursWorked: adjustedTotalHours
        })

    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function createTimesheet(req, res) {
    const mysqlClient = req.app.mysqlClient
    const { timesheets } = req.body
    const userId = req.session.user.userId
    const uploadedFiles = Array.isArray(req.files) ? req.files : []

    if (!['hr', 'employee'].includes(req.session.user.role)) {
        for (const file of uploadedFiles) {
            await deleteFile(file.path, fs)
        }
        return res.status(403).send('Unauthorized access')
    }

    try {
        const parsedTimesheets = JSON.parse(timesheets)
    
        const insertedIds = []
        const movedFiles = []

        for (let i = 0; i < parsedTimesheets.length; i++) {
            const timesheet = parsedTimesheets[i]
            const file = uploadedFiles[i]

            await timesheetValidation.validate(timesheet, { abortEarly: false })

            if (file && file.size > 5 * 1024 * 1024) {
                throw new Error(`File size exceeds 5MB for record ${i + 1}`)
            }

            const { projectId, task, hoursWorked, workDate } = timesheet;
            const insertResult = await mysqlQuery(/*sql*/`
                INSERT INTO timesheets (projectId, userId, task, hoursWorked, workDate)
                VALUES (?, ?, ?, ?, ?)`,
                [projectId, userId, task, hoursWorked, workDate], mysqlClient
            )

            if (insertResult.affectedRows === 0) {
                throw new Error(`Insert failed for record ${i + 1}`)
            }

            const timesheetId = insertResult.insertId
            insertedIds.push(timesheetId)

            if (file) {
                const originalDir = path.dirname(file.path)
                const ext = path.extname(file.originalname)
                const filename = `${timesheetId}_${Date.now()}${ext}`
                const newPath = path.join(originalDir, filename)

                await new Promise((resolve, reject) => {
                    fs.rename(file.path, newPath, (err) => {
                        if (err) return reject(err)
                        movedFiles.push(newPath)
                        resolve()
                    })
                })

                const updateResult = await mysqlQuery(/*sql*/`
                    UPDATE timesheets SET documentImage = ? WHERE timesheetId = ?`,
                    [filename, timesheetId], mysqlClient
                )

                if (updateResult.affectedRows === 0) {
                    throw new Error(`Image update failed for record ${i + 1}`)
                }
            }
        }

        res.status(200).send({ success: true, message: 'All timesheets added successfully' })

    } catch (error) {
        for (const file of uploadedFiles) {
            if (file?.path) await deleteFile(file.path, fs)
        }

        res.status(400).send({ success: false, message: error.message || 'Failed to create timesheets' })
    } 
}


module.exports = (app) => {
    app.get('/api/timesheets', readTimesheets)
    app.post('/api/timesheets', multerMiddleware, createTimesheet)
}
