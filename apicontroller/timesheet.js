const { mysqlQuery, deleteFile } = require('../utilityclient/query')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const yup = require('yup')
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', 'reportdocuploads'))
    },
    filename: function (req, file, cb) {
        const userId = req.params.userId
        const fileExtension = path.extname(file.originalname)
        cb(null, `${userId}_${Date.now()}${fileExtension}`)
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
const multerMiddleware = upload.single('documentImage')

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

// async function createTimesheet(req, res) {
//     const mysqlClient = req.app.mysqlClient
//     const { 
//         projectId, 
//         task, 
//         hoursWorked, 
//         workDate 
//     } = req.body   
//     const userId = req.session.user.userId;
//     const uploadedFilePath = req.file?.path || null

//     if (!['hr', 'employee'].includes(req.session.user.role)) {
//         if (uploadedFilePath) {
//             await deleteFile(uploadedFilePath, fs)
//         }
//         return res.status(409).send('User does not have permission to post report')
//     }
//     let errors = []

//     try {
//         await timesheetValidation.validate(req.body, { abortEarly: false })
//     } catch (validationError) {
//         errors = errors.concat(validationError.errors)
//     }

//     if (req.fileValidationError) {
//         errors.push(req.fileValidationError)
//     }

//     if (req.file && req.file.size > 5 * 1024 * 1024) {
//         errors.push('File size must be 5MB or less.')
//     }

//     if (errors.length > 0) {
//         if (uploadedFilePath) {
//             await deleteFile(uploadedFilePath, fs)
//         }
//         return res.status(400).send(errors)
//     }

//     try {
//         const newReport = await mysqlQuery(/*sql*/`
//             INSERT INTO timesheets 
//                 (projectId, userId, task, hoursWorked, workDate)
//             values(?, ?, ?, ?, ?)`,
//             [projectId, userId, task, hoursWorked, workDate], mysqlClient)
        
//         if (newReport.affectedRows === 0) {
//             if (uploadedFilePath) {
//                 await deleteFile(uploadedFilePath, fs)
//             }
//             return res.status(400).send('No report was posted')
//         }

//         if (uploadedFilePath) {
//             const originalDir = path.dirname(uploadedFilePath)
//             const fileExtension = path.extname(req.file.originalname)
//             const filename = `${newReport.insertId}_${Date.now()}${fileExtension}`
//             const newFilePath = path.join(originalDir, filename)

//             fs.rename(uploadedFilePath, newFilePath, async (err) => {
//                 if (err) {
//                     await deleteFile(uploadedFilePath, fs)
//                     return res.status(400).send('Error renaming file')
//                 }
//             })

//             const image = await mysqlQuery(/*sql*/`
//                 UPDATE 
//                     timesheets 
//                     SET documentImage = ? 
//                 WHERE 
//                     timesheetId = ?`,
//                 [filename, newReport.insertId], mysqlClient)

//             if (image.affectedRows === 0) {
//                 await deleteFile(uploadedFilePath, fs)
//                 return res.status(400).send('Image is not set')
//             }
//         }
//         res.status(201).send('Successfully posted...')
//     } catch (error) {
//         req.log.error(error)
//         return res.status(500).send(error)
//     }
// }

async function createTimesheet(req, res) {
    const mysqlClient = req.app.mysqlClient;
    const { timesheets } = req.body;
    const userId = req.session.user.userId;
    const uploadedFiles = req.files || [];

    if (!['hr', 'employee'].includes(req.session.user.role)) {
        for (const file of uploadedFiles) {
            await deleteFile(file.path, fs);
        }
        return res.status(409).send('User does not have permission to post report');
    }

    let errors = [];

    try {
        const parsedTimesheets = JSON.parse(timesheets);

        for (const timesheet of parsedTimesheets) {
            await timesheetValidation.validate(timesheet, { abortEarly: false });
        }

        if (uploadedFiles.some(file => file.size > 5 * 1024 * 1024)) {
            errors.push('Each file size must be 5MB or less.');
        }

        if (errors.length > 0) {
            for (const file of uploadedFiles) {
                await deleteFile(file.path, fs);
            }
            return res.status(400).send(errors);
        }

        const insertResults = [];

        for (let i = 0; i < parsedTimesheets.length; i++) {
            const { projectId, task, hoursWorked, workDate } = parsedTimesheets[i];

            const result = await mysqlQuery(/*sql*/`
                INSERT INTO timesheets 
                    (projectId, userId, task, hoursWorked, workDate)
                VALUES (?, ?, ?, ?, ?)
            `, [projectId, userId, task, hoursWorked, workDate], mysqlClient);

            if (result.affectedRows === 0) {
                for (const file of uploadedFiles) {
                    await deleteFile(file.path, fs);
                }
                return res.status(400).send('No report was posted');
            }

            insertResults.push({ timesheetId: result.insertId, file: uploadedFiles[i] });
        }

        for (const { timesheetId, file } of insertResults) {
            if (file) {
                const originalDir = path.dirname(file.path);
                const fileExtension = path.extname(file.originalname);
                const filename = `${timesheetId}_${Date.now()}${fileExtension}`;
                const newFilePath = path.join(originalDir, filename);

                await new Promise((resolve, reject) => {
                    fs.rename(file.path, newFilePath, async (err) => {
                        if (err) {
                            await deleteFile(file.path, fs);
                            return reject('Error renaming file');
                        }
                        resolve();
                    });
                });

                const updateImageResult = await mysqlQuery(/*sql*/`
                    UPDATE timesheets 
                    SET documentImage = ? 
                    WHERE timesheetId = ?
                `, [filename, timesheetId], mysqlClient);

                if (updateImageResult.affectedRows === 0) {
                    await deleteFile(newFilePath, fs);
                    return res.status(400).send('Image is not set');
                }
            }
        }

        res.status(201).send('Successfully posted all timesheets.');
    } catch (error) {
        req.log.error(error);
        for (const file of uploadedFiles) {
            await deleteFile(file.path, fs);
        }
        return res.status(500).send(error);
    }
}

module.exports = (app) => {
    app.get('/api/timesheets', readTimesheets)
    app.post('/api/timesheets', multerMiddleware, createTimesheet)
}
