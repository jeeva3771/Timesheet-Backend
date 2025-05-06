const { mysqlQuery } = require('../utilityclient/query')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const mime = require('mime-types') // Make sure to install this: npm install mime-types
const yup = require('yup')
const { formatDateLocal, capitalizeWords } = require('../utilityclient/utils')

const ALLOWED_UPDATE_KEYS = [
    "projectId",
    "workDate",
    "hoursWorked",
    "task"
]

const validHours = [
    1, 1.25, 1.5, 1.75,
    2, 2.25, 2.5, 2.75,
    3, 3.25, 3.5, 3.75,
    4, 4.25, 4.5, 4.75,
    5, 5.25, 5.5, 5.75,
    6, 6.25, 6.5, 6.75,
    7, 7.25, 7.5, 7.75,
    8, 8.25, 8.5, 8.75,
    9, 9.25, 9.5, 9.75,
    10, 10.25, 10.5, 10.75,
    11, 11.25, 11.5, 11.75,
    12
]

const adjustments = {
    1.00: 1, 1.25: 1.15, 1.50: 1.30, 1.75: 1.45, 
    2.00: 2, 2.25: 2.15, 2.50: 2.30, 2.75: 2.45, 
    3.00: 3, 3.25: 3.15, 3.50: 3.30, 3.75: 3.45, 
    4.00: 4, 4.25: 4.15, 4.50: 4.30, 4.75: 4.45, 
    5.00: 5, 5.25: 5.15, 5.50: 5.30, 5.75: 5.45, 
    6.00: 6, 6.25: 6.15, 6.50: 6.30, 6.75: 6.45, 
    7.00: 7, 7.25: 7.15, 7.50: 7.30, 7.75: 7.45, 
    8.00: 8, 8.25: 8.15, 8.50: 8.30, 8.75: 8.45, 
    9.00: 9, 9.25: 9.15, 9.50: 9.30, 9.75: 9.45, 
    10.00: 10, 10.25: 10.15, 10.50: 10.30, 10.75: 10.45, 
    11.00: 11, 11.25: 11.15, 11.50: 11.30, 11.75: 11.45, 
    12.00: 12
}

const timesheetValidation = yup.object().shape({
    projectId: yup.number()
        .integer('Project ID must be a number')
        .positive('Project ID must be positive')
        .required('Project is required'),

    task: yup.string()
        .required('Task is required')
        .min(3, 'Task must be at least 3 characters long'),

    hoursWorked: yup.number()
        .required('Hour(s) is required')
        .oneOf(validHours, 'Invalid hours entered'),
})

const addWorkDateValidation  = yup.object().shape({
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

const editWorkDateValidation  = yup.object().shape({
    workDate: yup.date() 
        .typeError('Work date must be a valid date')
        .required('Work date is required')
})

const addValidation = yup.object().shape({
    ...timesheetValidation.fields,
    ...addWorkDateValidation.fields
})

const editValidation = yup.object().shape({
    ...timesheetValidation.fields,
    ...editWorkDateValidation.fields
})



const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure upload directory exists
        const uploadDir = path.join(__dirname, '..', 'reportdocuploads')
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }
        cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
        // Create a unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix)    
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
        // Store file validation errors in an array for better handling
        if (!req.fileValidationErrors) {
            req.fileValidationErrors = []
        }
        
        // Extract index from field name
        let fieldIndex = 'unknown'
        let entryNumber = 'unknown'
        
        if (file.fieldname) {
            const matches = file.fieldname.match(/file_(\d+)/);
            if (matches && matches[1]) {
                fieldIndex = matches[1]
                entryNumber = parseInt(fieldIndex) + 1
            }
        }
        
        req.fileValidationErrors.push({
            field: file.fieldname,
            index: fieldIndex,
            filename: file.originalname,
            error: `Invalid file type: ${file.originalname}. Only JPEG, PNG, JPG, and Excel (XLS/XLSX) files are allowed`
        })
        
        cb(null, false)
    }
}

const upload = multer({ 
    storage, 
    fileFilter
})

function adjustHours(value) {
    return adjustments[value] !== undefined ? adjustments[value] : value
}

const handleTimeSheetUploads = (req, res, next) => {
    req.validationErrors = []
    req.fileValidationErrors = []
    
    // Create field configurations for possible file fields (file_0, file_1, etc.)
    const fieldConfigs = []
    
    // Support up to 20 file fields (adjust as needed)
    for (let i = 0; i < 20; i++) {
        fieldConfigs.push({ name: `file_${i}`, maxCount: 1 })
    }
    
    // Use fields() instead of array() to handle multiple named fields
    const uploadMiddleware = upload.fields(fieldConfigs)
    
    // Process the request with our configured middleware
    uploadMiddleware(req, res, function(err) {
        // Handle unexpected errors
        if (err) {
            req.fileValidationErrors.push({
                field: 'general',
                index: 'unknown',
                error: `Upload error: ${err.message}`
            })
        }
        
        // Manually check all uploaded files for size
        if (req.files) {
            Object.keys(req.files).forEach(fieldName => {
                const files = req.files[fieldName]
                if (Array.isArray(files) && files.length > 0) {
                    files.forEach(file => {
                        // Check file size against 5MB limit
                        if (file.size > 5 * 1024 * 1024) {
                            let fieldIndex = 'unknown'
                            let entryNumber = 'unknown'
                            
                            const matches = fieldName.match(/file_(\d+)/)
                            if (matches && matches[1]) {
                                fieldIndex = matches[1]
                                entryNumber = parseInt(fieldIndex) + 1
                            }
                        
                        }
                    })
                }
            })
        }
        
        // Continue to the next middleware
        next()
    })
}


async function readTimesheets(req, res) {  
    const mysqlClient = req.app.mysqlClient
    // const limit = req.query.limit ? parseInt(req.query.limit) : null
    // const page = req.query.page ? parseInt(req.query.page) : null
    // const offset = limit && page ? (page - 1) * limit : null
    const orderBy = req.query.orderby || 't.workDate'
    const sort = req.query.sort || 'DESC'
    const fromDate = req.query.fromDate || null
    const toDate = req.query.toDate || null
    const projectId = req.query.projectId || null
    let userId

    if (!['admin', 'manager'].includes(req.session.user.role)) {
        userId = req.session.user.userId
    } else {
        userId = req.query.userId || null
    }

    let whereConditions = ["1=1"]
    let queryParameters = []

    if (userId) {
        whereConditions.push(`t.userId = ?`)
        queryParameters.push(userId)
    }
    
    if (projectId) {
        whereConditions.push(`t.projectId = ?`)
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

    // if (limit !== null) {
    //     timesheetsQuery += ' LIMIT ? OFFSET ?'
    //     queryParameters.push(limit, offset)
    // }

    // const defaultCountQuery = /*sql*/`
    //     SELECT COUNT(*) AS totalTimesheetCount
    //     FROM timesheets AS t
    //     LEFT JOIN users AS ur ON ur.userId = t.userId
    //     LEFT JOIN projects p ON p.projectId = t.projectId
    //     ${whereClause}`

    const totalHoursQuery = /*sql*/`
        SELECT SUM(t.hoursWorked) AS totalHours
        FROM timesheets AS t
        LEFT JOIN users AS ur ON ur.userId = t.userId
        LEFT JOIN projects p ON p.projectId = t.projectId
        ${whereClause}`

    try {
        const [timesheets, totalHours] = await Promise.all([
            mysqlQuery(timesheetsQuery, queryParameters, mysqlClient),
            // mysqlQuery(defaultCountQuery, queryParameters, mysqlClient),
            mysqlQuery(totalHoursQuery, queryParameters, mysqlClient)
        ])

        const updatedTimesheets = timesheets.map(row => ({
            ...row,
            hoursWorked: adjustHours(row.hoursWorked)
        }))

        let adjustedTotalHours = adjustHours(totalHours[0].totalHours || 0)

        res.status(200).json({
            timesheets: updatedTimesheets,
            // totalTimesheetCount: defaultCount[0].totalTimesheetCount,
            totalAdjustedHoursWorked: adjustedTotalHours
        })

    } catch (error) {
        req.log.error(error)
        res.status(500).json('Something went wrong. Please try again later.')
    }
}


async function readTimesheetById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const timesheetId = req.params.timesheetId

    try {
        const timesheet = await mysqlQuery(/*sql*/`
            SELECT 
                t.*,
                ur.name AS createdName,
                ur.role AS role,
                ur2.name AS updatedName,
                DATE_FORMAT(t.workDate, "%d-%b-%Y") AS workedDate,
                DATE_FORMAT(t.createdAt, "%d-%b-%Y %r") AS createdTime,
                DATE_FORMAT(t.updatedAt, "%d-%b-%Y %r") AS updatedTime
            FROM timesheets AS t
            LEFT JOIN users AS ur ON ur.userId = t.userId
            LEFT JOIN users AS ur2 ON ur2.userId = t.updatedBy
            WHERE  
                t.timesheetId = ?
        `, [timesheetId], mysqlClient)

        if (timesheet.length > 0) {
            res.status(200).json(timesheet)
        } else {
            res.status(404).json('Timesheet not found')
        }
    } catch (error) {
        console.log(error)
        req.log.error(error)
        res.status(500).json(error)
    }
}

async function createTimesheet(req, res) {
    const mysqlClient = req.app.mysqlClient
    // Get files from request (now organized by field name)
    const files = req.files || {}
    let parsedTimesheets
    
    // Collect all validation errors
    const allErrors = []
    const errorsByReport = {}
    
    // Group file validation errors by report
    if (req.fileValidationErrors && req.fileValidationErrors.length > 0) {
        req.fileValidationErrors.forEach(error => {
            if (error.index !== undefined && error.index !== 'unknown') {
                const reportNum = parseInt(error.index) + 1
                if (!errorsByReport[reportNum]) {
                    errorsByReport[reportNum] = []
                }
                errorsByReport[reportNum].push(error.error)
            } else {
                // General errors not tied to a specific report
                allErrors.push(error.error)
            }
        })
    }
    
    try {
        // Parse timesheet data
        parsedTimesheets = JSON.parse(req.body.timesheets || '[]')
        
        // Parse file indices if available
        if (req.body.fileIndices) {
            fileIndices = JSON.parse(req.body.fileIndices)
        }
    } catch (error) {
        // Clean up files on parse error
        cleanupFiles(files)
        return res.status(400).json(['Invalid request format'])
    }
    
    const userId = req.session.user.userId
    const role = req.session.user.role
    const insertedIds = []
    const movedFiles = []
    
    // Validate user permissions
    const hasInvalidUser = parsedTimesheets.some(sheet => 
        sheet.userId && sheet.userId !== userId
    );
    
    if (hasInvalidUser) {
        // Clean up files on unauthorized access
        cleanupFiles(files)
        return res.status(403).json(['User not valid'])
    }

    if (!['hr', 'employee'].includes(role)) {
        // Clean up files on unauthorized access
        cleanupFiles(files)
        return res.status(403).json(['Unauthorized access'])
    }

    try {
        // Validate all timesheet entries
        for (let i = 0; i < parsedTimesheets.length; i++) {
            const timesheet = parsedTimesheets[i]
            
            // Get the file for this entry
            const fileArray = files[`file_${i}`] || []
            const file = fileArray.length > 0 ? fileArray[0] : null
            
            // Validate timesheet fields
            const fieldValidationErrors = await validateTimesheet(timesheet, file, i, false, mysqlClient)
            
            // Group field validation errors by report number
            if (fieldValidationErrors.length > 0) {
                const reportNum = i + 1
                if (!errorsByReport[reportNum]) {
                    errorsByReport[reportNum] = []
                }
                
                // Extract just the error messages without the "Report X:" prefix
                fieldValidationErrors.forEach(error => {
                    const errorMsg = error.replace(`Report ${reportNum}: `, '')
                    errorsByReport[reportNum].push(errorMsg)
                })
            }
        }
        
        // Format grouped errors for response
        Object.keys(errorsByReport).forEach(reportNum => {
            const errors = errorsByReport[reportNum]
            allErrors.push(`Report ${reportNum}: ${errors.join(', ')}`)
        });

        if (allErrors.length > 0) {
            // Clean up files on validation error
            cleanupFiles(files)
            return res.status(400).json(allErrors)
        }

        // If no errors, process all timesheet entries
        for (let i = 0; i < parsedTimesheets.length; i++) {
            const timesheet = parsedTimesheets[i]
            
            // Get the file for this entry
            const fileArray = files[`file_${i}`] || []
            const file = fileArray.length > 0 ? fileArray[0] : null

            const { projectId, task, hoursWorked, workDate } = timesheet

            // Insert timesheet record
            const insertResult = await mysqlQuery(/*sql*/`
                INSERT INTO timesheets (projectId, userId, task, hoursWorked, workDate)
                VALUES (?, ?, ?, ?, ?)`,
                [projectId, userId, task, hoursWorked, workDate || new Date().toISOString().split('T')[0]],
                mysqlClient
            )

            if (insertResult.affectedRows === 0) {
                // Rollback on failure
                if (insertedIds.length > 0) {
                    await mysqlQuery(/*sql*/`
                        DELETE FROM timesheets WHERE timesheetId IN (${insertedIds.map(() => '?').join(',')})`,
                        insertedIds,
                        mysqlClient
                    )
                }
        
                // Delete moved files
                for (const filePath of movedFiles) {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath)
                    }
                }
                
                return res.status(400).json([`Insert failed at report ${i + 1}`])
            }

            const timesheetId = insertResult.insertId
            insertedIds.push(timesheetId)

            // Process file if it exists for this entry
            if (file && file.size > 0) {
                const ext = path.extname(file.originalname)
                const filename = `${timesheetId}_${Date.now()}${ext}`
                const newPath = path.join(path.dirname(file.path), filename)

                // Rename the file to include the timesheet ID
                await new Promise((resolve, reject) => {
                    fs.rename(file.path, newPath, err => {
                        if (err) return reject(err)
                        movedFiles.push(newPath)
                        resolve()
                    })
                })

                // Update the timesheet record with the file name
                await mysqlQuery(/*sql*/`
                    UPDATE timesheets SET documentImage = ? WHERE timesheetId = ?`,
                    [filename, timesheetId],
                    mysqlClient
                )
            }
        }

        res.status(201).json('Successfully submitted...')
    } catch (error) {        
        // Clean up on error
        try {
            // Rollback inserted records
            if (insertedIds.length > 0) {
                await mysqlQuery(/*sql*/`
                    DELETE FROM timesheets WHERE timesheetId IN (${insertedIds.map(() => '?').join(',')})`,
                    insertedIds,
                    mysqlClient
                )
            }
            
            // Delete moved files
            for (const filePath of movedFiles) {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath)
                }
            }
            
            // Delete uploaded files
            cleanupFiles(files)
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError)
        }
        res.status(500).json('Something went wrong. Please try again later.')
    }
}

// async function editTimesheet(req, res) {
//     const timesheetId = req.params.timesheetId
//     const mysqlClient = req.app.mysqlClient
//     const updatedBy = req.session.user.userId
//     const values = []
//     const updates = []

//     if (!['admin', 'manager'].includes(req.session.user.role)) {
//         return res.status(409).json('User does not have permission to edit a time sheet')
//     }

//     ALLOWED_UPDATE_KEYS.forEach((key) => {
//         keyValue = req.body[key]
//         if (keyValue !== undefined) {
//             values.push(keyValue)
//             updates.push(` ${key} = ?`)
//         }
//     })

//     updates.push('updatedBy = ?')
//     values.push(updatedBy, timesheetId)

//     try {
//         const timesheet = await mysqlQuery(/*sql*/`
//             SELECT * FROM timesheets 
//             WHERE timesheetId = ?`, 
//         [timesheetId], mysqlClient)

//         if (!timesheet.length) {
//             return res.status(404).json('Time sheet is not found')
//         }

//         const fieldValidationErrors = await validateTimesheet(req.body, null, null, true, mysqlClient)
//         if (fieldValidationErrors.length > 0) {
//             return res.status(400).json(fieldValidationErrors)
//         }

//         const updateUser = await mysqlQuery(/*sql*/`
//             UPDATE timesheets SET ${updates.join(', ')} 
//             WHERE timesheetId = ?`,
//             values, mysqlClient)

//         if (updateUser.affectedRows === 0) {
//             return res.status(204).json('No changes made')
//         }

//         res.status(200).json('Successfully updated...')
//     } catch (error) {
//         console.log(error)

//         req.log.error(error)
//         res.status(500).json(error)
//     }
// }

// Backend code for editTimesheet
async function editTimesheet(req, res) {
    const timesheetId = req.params.timesheetId
    const mysqlClient = req.app.mysqlClient
    const updatedBy = req.session.user.userId
    const values = []
    const updates = []
    let changes = []

    if (!['admin', 'manager'].includes(req.session.user.role)) {
        return res.status(409).json('User does not have permission to edit a time sheet')
    }

    // Specify which fields can be updated
    ALLOWED_UPDATE_KEYS.forEach((key) => {
        keyValue = req.body[key]
        if (keyValue !== undefined) {
            values.push(keyValue)
            updates.push(` ${key} = ?`)
        }
    })

    updates.push('updatedBy = ?')
    values.push(updatedBy, timesheetId)

    try {
        // Check if timesheet exists
        const timesheet = await mysqlQuery(/*sql*/`
            SELECT t.*, p.projectName AS project
            FROM timesheets t
            LEFT JOIN projects p ON p.projectId = t.projectId
            WHERE t.timesheetId = ?`, 
        [timesheetId], mysqlClient)

        if (!timesheet.length) {
            return res.status(404).json('Time sheet is not found')
        }

        const originalTimesheet = timesheet[0]

        // Validate timesheet data
        const fieldValidationErrors = await validateTimesheet(req.body, null, null, true, mysqlClient)
        if (fieldValidationErrors.length > 0) {
            return res.status(400).json(fieldValidationErrors)
        }

        // Track changes similar to project edit
        for (const key of ALLOWED_UPDATE_KEYS) {
            const newValue = req.body[key]
            const oldValue = originalTimesheet[key]
            
            if (newValue !== undefined && newValue !== oldValue) {
                if (key === 'workDate') {
                    const formattedNew = formatDateLocal(newValue)
                    const formattedOld = formatDateLocal(oldValue)
                    if (formattedNew !== formattedOld) {
                        changes.push(`Date changed from '${formattedOld}' to '${formattedNew}'`)
                    }
                } else if (key === 'projectId') {
                    // Get project names for the IDs
                    const [projectRows] = await Promise.all([
                        mysqlQuery(/*sql*/`
                            SELECT projectId, projectName 
                            FROM projects 
                            WHERE projectId IN (?, ?)`, 
                        [oldValue, newValue], mysqlClient)
                    ])
                    
                    // const oldProject = projectRows.find(proj => proj.projectId == oldValue)?.projectName || oldValue
                    // const newProject = projectRows.find(proj => proj.projectId == newValue)?.projectName || newValue
                    
                    // changes.push(`Project changed from '${oldProject}' to '${newProject}'`)
                   
                    
                    const oldProjectRaw = projectRows.find(proj => proj.projectId == oldValue)?.projectName || oldValue;
                    const newProjectRaw = projectRows.find(proj => proj.projectId == newValue)?.projectName || newValue;
                    
                    const oldProject = typeof oldProjectRaw === 'string' ? cleanProjectName(oldProjectRaw) : oldProjectRaw;
                    const newProject = typeof newProjectRaw === 'string' ? cleanProjectName(newProjectRaw) : newProjectRaw;
                    
                    changes.push(`Project changed from '${oldProject}' to '${newProject}'`);
                } else if (key === 'hoursWorked') {
                    const oldHours = parseFloat(oldValue);
                    const newHours = parseFloat(newValue);

                    const formattedOld = formatCustomHours(oldHours);
                    const formattedNew = formatCustomHours(newHours);

                    if (formattedOld !== formattedNew) {
                        changes.push(`Hours worked changed from '${formattedOld} hour(s)' to '${formattedNew} hour(s)'`);
                    }

                    // changes.push(`Hours worked changed from '${oldValue}' to '${newValue}'`)
                } else if (key === 'task') {
                    // For task changes, you might want to abbreviate the task text if it's too long
                    const oldTask = oldValue?.length > 30 ? oldValue.substring(0, 30) + '...' : oldValue
                    const newTask = newValue?.length > 30 ? newValue.substring(0, 30) + '...' : newValue
                    
                    changes.push(`Task changed from '${oldTask}' to '${newTask}'`)
                }
            }
        }

        // Update timesheet
        const updateTimesheet = await mysqlQuery(/*sql*/`
            UPDATE timesheets SET ${updates.join(', ')} 
            WHERE timesheetId = ?`,
            values, mysqlClient)

        if (updateTimesheet.affectedRows === 0) {
            return res.status(204).json('No changes made')
        }

        // Record changes in history table
        if (changes.length > 0) {
            const changesText = changes.join('|| ')

            const historyEntry = await mysqlQuery(/*sql*/`
                INSERT INTO timesheetHistorys 
                    (timesheetId, changes, createdBy) 
                VALUES (?, ?, ?)`,
                [timesheetId, changesText, updatedBy], mysqlClient)

            if (historyEntry.affectedRows === 0) {
                return res.status(400).json('Failed to insert history record')
            }
        }

        res.status(200).json('Successfully updated...')
    } catch (error) {
        console.log(error)
        req.log.error(error)
        res.status(500).json(error)
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
        res.status(500).json("Something went wrong. Please try again later.")
    }
}

async function readTimesheetHistory(req, res) {
    const mysqlClient = req.app.mysqlClient
    try {
        const timesheetHistory = await mysqlQuery(/*sql*/`
            SELECT 
                tsh.*,
                ur.name AS createdName,
                u.name AS timesheetUserName,                -- user who submitted the timesheet
                DATE_FORMAT(t.workDate, "%d-%b-%Y") AS workedDate,
                DATE_FORMAT(tsh.createdAt, "%d-%b-%Y %r") AS editedDate,
                CONCAT(tsh.changes, ' by ', ur.name) AS changesWithCreator
            FROM timesheetHistorys AS tsh
            LEFT JOIN users AS ur ON ur.userId = tsh.createdBy
            LEFT JOIN timesheets AS t ON t.timesheetId = tsh.timesheetId
            LEFT JOIN users AS u ON u.userId = t.userId            

            ORDER BY tsh.createdAt DESC`,
            [], mysqlClient)
        
        const formattedHistory = timesheetHistory.map(record => ({
            ...record,
            editedDate: capitalizeWords(record.editedDate),
            changesWithCreator: record.changesWithCreator
        }))
            
        res.status(200).json(formattedHistory)
    } catch (error) {
        console.log(error)
        req.log.error(error)
        res.status(500).json(error)
    }

}

// Helper function to clean up files
function cleanupFiles(files) {
    Object.values(files).forEach(fileArray => {
        if (Array.isArray(fileArray)) {
            fileArray.forEach(file => {
                if (file.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path)
                }
            })
        }
    })
}

async function validateTimesheet(timesheet, file, index, isUpdate = false, mysqlClient) {
    const errors = []

    if (!isUpdate) {
        if (timesheet.projectId) {
            const [validateProjectExists] = await mysqlQuery(/*sql*/`
                SELECT COUNT(*) AS count FROM projects 
                WHERE projectId = ? AND deletedAt IS NULL`,
                [timesheet.projectId], mysqlClient)
        
            if (validateProjectExists.count === 0) {
                errors.push('Project is deleted') 
                return errors
            }
        }
        
        try {
            await addValidation.validate(timesheet, { abortEarly: false })
        } catch (validationErr) {
            validationErr.errors.forEach(err => {
                errors.push(`Report ${index + 1}: ${err}`)
            })
        }

        if (file && file.size > 5 * 1024 * 1024) {
            errors.push(`Report ${index + 1}: File size exceeds 5MB`)
        }
    } else if (isUpdate) {
        try {
            await editValidation.validate(timesheet, { abortEarly: false })
        } catch (validationErr) {
            validationErr.errors.forEach(err => {
                errors.push(err)
            })
        }
    }

    return errors
}

function cleanProjectName(name) {
    const hasDeletedTimestamp = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(name)
    const cleanedName = name
        .replace(/\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, '')
        .replace(/-\s*$/, '')
        .trim()
    return hasDeletedTimestamp ? `${cleanedName} (Deleted)` : cleanedName
}

function formatCustomHours(value) {
    const floatVal = parseFloat(value)
    const base = Math.floor(floatVal)
    const decimal = floatVal - base

    if (decimal === 0) return `${base}`

    let suffix = '00'
    if (decimal > 0 && decimal <= 0.26) {
        suffix = '15'
    } else if (decimal > 0.26 && decimal <= 0.51) {
        suffix = '30'
    } else if (decimal > 0.51 && decimal <= 0.76) {
        suffix = '45'
    } else {
        return `${base + 1}`
    }

    return `${base}.${suffix}`
}
module.exports = (app) => {
    app.get('/api/timesheets', readTimesheets)
    app.get('/api/timesheets/history', readTimesheetHistory)
    app.post('/api/timesheets', handleTimeSheetUploads, createTimesheet)
    app.get('/api/timesheets/documentimage/:timesheetId', readTimeSheetDocumentById)
    app.get('/api/timesheets/:timesheetId', readTimesheetById)
    app.put('/api/timesheets/:timesheetId', editTimesheet)
}
