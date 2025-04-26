const { mysqlQuery } = require('../utilityclient/query')
const yup = require('yup')
const { formatDateLocal, capitalizeWords } = require('../utilityclient/utils')

const ALLOWED_UPDATE_KEYS = [
    "projectName",
    "clientName",
    "managerId",
    "employeeId",
    "startDate",
    "endDate",
    "status"
]

const projectValidation = yup.object().shape({
    projectName: yup.string().min(2, 'Project Name must be at least 2 characters long').required('Project Name is required'),
    clientName: yup.string().min(2, 'Client Name must be at least 2 characters long').required('Client Name is required'),
    managerId: yup.number().integer('Manager Name must be a number').positive('Manager Name must be positive').required('Manager Name is required'),
    employeeIds: yup.array()
        .of(
            yup.number()
                .integer('Each Employee ID must be an integer')
        )
        .required('Allot Employee is required')
        .test('all-positive', 'Allot Employee must be entered', value => 
            Array.isArray(value) && value.length > 0 && value.every(id => Number.isInteger(id) && id > 0)
        ),
    startDate: yup.date().required('Start date is required'),
    endDate: yup.date()
        .min(yup.ref('startDate'), 'End date cannot be before start date')
        .required('End date is required'),
    status: yup.mixed()
        .oneOf(['active','pending','completed','notStarted'], 'Invalid status')
        .required('Status is required')
})

async function readProjects(req, res) {
    const mysqlClient = req.app.mysqlClient
    const limit = req.query.limit ? parseInt(req.query.limit) : null
    const page = req.query.page ? parseInt(req.query.page) : null
    const offset = limit && page ? (page - 1) * limit : null
    const orderBy = req.query.orderby || 'p.projectId'
    const sort = req.query.sort || 'DESC'
    const searchQuery = req.query.search || ''
    const searchPattern = `%${searchQuery}%`

    const searchParams = [
        searchPattern, // p.projectName
        searchPattern, // u.name (createdBy)
        searchPattern, // u2.name (manager)
        searchPattern, // ue.name (assigned employee)
        searchPattern, // p.client
        searchPattern, // p.startDate
        searchPattern, // p.endDate
        searchPattern  // p.status
    ]

    let queryParameters = [...searchParams]
    let countQueryParameters = [...searchParams]

    let projectsQuery = /*sql*/`
        SELECT 
            p.*,
            u.name AS createdName,
            u2.name AS managerName,
            GROUP_CONCAT(ue.name ORDER BY ue.name SEPARATOR ', ') AS assignedEmployees,
            DATE_FORMAT(p.startDate, "%d-%b-%Y") AS projectStart,
            DATE_FORMAT(p.endDate, "%d-%b-%Y") AS projectEnd
        FROM projects AS p
        LEFT JOIN users AS u ON u.userId = p.createdBy
        LEFT JOIN users AS u2 ON u2.userId = p.managerId
        LEFT JOIN projectEmployees AS pe ON pe.projectId = p.projectId
        LEFT JOIN users AS ue ON ue.userId = pe.employeeId
        WHERE 
            p.deletedAt IS NULL AND 
            pe.deletedAt IS NULL AND
            (p.projectName LIKE ? OR u.name LIKE ? OR u2.name LIKE ? OR ue.name LIKE ? OR p.clientName LIKE ?
                OR DATE_FORMAT(p.startDate, "%d-%b-%Y") LIKE ? 
                OR DATE_FORMAT(p.endDate, "%d-%b-%Y") LIKE ?
                OR p.status LIKE ?)
        GROUP BY p.projectId
        ORDER BY ${orderBy} ${sort}`

    if (limit >= 0) {
        projectsQuery += ' LIMIT ? OFFSET ?'
        queryParameters.push(limit, offset)
    }

    let countQuery = /*sql*/`
        SELECT COUNT(DISTINCT p.projectId) AS totalProjectCount
        FROM projects AS p
        LEFT JOIN users AS u ON u.userId = p.createdBy
        LEFT JOIN users AS u2 ON u2.userId = p.managerId
        LEFT JOIN projectEmployees AS pe ON pe.projectId = p.projectId
        LEFT JOIN users AS ue ON ue.userId = pe.employeeId        
        WHERE 
            p.deletedAt IS NULL AND 
            pe.deletedAt IS NULL AND
            (p.projectName LIKE ? OR u.name LIKE ? OR u2.name LIKE ? OR ue.name LIKE ? OR p.clientName LIKE ?
                OR DATE_FORMAT(p.startDate, "%d-%b-%Y") LIKE ? 
                OR DATE_FORMAT(p.endDate, "%d-%b-%Y") LIKE ?
                OR p.status LIKE ?)`

    try {
        const [projects, totalCount] = await Promise.all([
            mysqlQuery(projectsQuery, queryParameters, mysqlClient),
            mysqlQuery(countQuery, countQueryParameters, mysqlClient)
        ])

        res.status(200).json({
            projects,
            projectCount: totalCount[0].totalProjectCount
        })

    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

async function readProjectById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const projectId = req.params.projectId

    try {
        const projectIsValid = await validateProjectById(projectId, mysqlClient)
        if (!projectIsValid) {
            return res.status(404).json('Project is not found')
        }

        const project = await mysqlQuery(/*sql*/`
            SELECT 
                p.*,
                ur.name AS createdName,
                ur2.name AS updatedName,
                ur3.name AS managerName,
                ue.userId AS employeeId,
                ue.name AS employeeName,
                DATE_FORMAT(p.startDate, "%d-%b-%Y") AS projectStart,
                DATE_FORMAT(p.endDate, "%d-%b-%Y") AS projectEnd,
                DATE_FORMAT(p.createdAt, "%d-%b-%Y %r") AS createdTime,
                DATE_FORMAT(p.updatedAt, "%d-%b-%Y %r") AS updatedTime
            FROM projects AS p
            LEFT JOIN users AS ur ON ur.userId = p.createdBy
            LEFT JOIN users AS ur2 ON ur2.userId = p.updatedBy
            LEFT JOIN users AS ur3 ON ur3.userId = p.managerId
            LEFT JOIN projectEmployees AS pe ON pe.projectId = p.projectId
            LEFT JOIN users AS ue ON ue.userId = pe.employeeId
            WHERE p.deletedAt IS NULL 
            AND pe.deletedAt IS NULL 
            AND p.projectId = ?
        `, [projectId], mysqlClient)

        if (project.length > 0) {
            const baseData = project[0]

            const assignedEmployeeIds = []
            const assignedEmployeeNames = []

            project.forEach(row => {
                if (row.employeeId) {
                    assignedEmployeeIds.push(row.employeeId)
                    assignedEmployeeNames.push(row.employeeName)
                }
            });

            const projectData = {
                ...baseData,
                assignedEmployeeIds,
                assignedEmployeeNames: assignedEmployeeNames.join(', ')
            };

            res.status(200).json([projectData])
        } else {
            res.status(404).json('Project not found')
        }
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

async function readProjectNames(req, res) {
    const mysqlClient = req.app.mysqlClient
    const inProgress = req.query.inProgress === 'true'
    const hr = req.query.hr === 'true'
    const employee = req.query.employee === 'true'
    const userId = req.query.userId || ''
    const deleted = req.query.deleted === 'true'

    try {
        let projectNamesQuery = /*sql*/`
            SELECT DISTINCT p.projectName, p.projectId
            FROM projects AS p`
        
        const queryParams = []

        if (hr || employee || userId) {
            projectNamesQuery += `
                LEFT JOIN projectEmployees AS pe ON pe.projectId = p.projectId
                LEFT JOIN users AS ur ON ur.userId = pe.employeeId`
        }
        
        if (deleted) {
            projectNamesQuery += ` WHERE p.deletedAt IS NULL`
        }

        if (inProgress) {
            projectNamesQuery += ` AND p.status = 'active'`
        }

        // Filter by role
        if (hr || employee) {
            const roles = []
            if (hr) roles.push("'hr'")
            if (employee) roles.push("'employee'")
            projectNamesQuery += ` AND ur.role IN (${roles.join(', ')})`
        }

        // Filter by userId (only if provided)
        if (userId) {
            projectNamesQuery += ` AND pe.employeeId = ?`
            queryParams.push(userId)
        }

        projectNamesQuery += ` ORDER BY p.projectName ASC`

        const projectNamesResult = await mysqlQuery(projectNamesQuery, queryParams, mysqlClient)
        return res.status(200).json(projectNamesResult)
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}


async function createProject(req, res) {
    const mysqlClient = req.app.mysqlClient
    const {
        projectName,
        clientName,
        managerId,
        employeeIds,
        startDate,
        endDate,
        status
    } = req.body    
    const createdBy = req.session.user.userId
    const assignedEmployees = Array.isArray(employeeIds) ? employeeIds : [employeeIds]

    if (!['admin', 'manager'].includes(req.session.user.role)) {
        return res.status(409).json('User does not have permission to create a project')
    }

    try {
        const validationErrors = await validatePayload(req.body, false, null, mysqlClient)
        if (validationErrors.length > 0) {
            return res.status(400).json(validationErrors)
        }

        const newProject = await mysqlQuery(/*sql*/`
            INSERT INTO projects 
                (projectName, clientName, managerId, startDate, endDate, status, createdBy)
            values(?, ?, ?, ?, ?, ?, ?)`,
            [projectName, clientName, managerId, startDate, endDate, status, createdBy], mysqlClient)
        
        if (newProject.affectedRows === 0) {
            return res.status(400).json('No insert was made')
        }

        const projectId = newProject.insertId

        if (assignedEmployees.length > 0) {
            const values = assignedEmployees.map(empId => [projectId, empId])
            const employeeAssigned = await mysqlQuery(/*sql*/`
                INSERT INTO projectEmployees (projectId, employeeId)
                VALUES ?`,
                [values], mysqlClient)
                
            if (employeeAssigned.affectedRows === 0) {
                const deleteProject = await mysqlQuery(/*sql*/`
                    DELETE FROM projects WHERE projectId = ?`,
                    [projectId], mysqlClient)

                if (deleteProject.affectedRows === 0) {
                    return res.status(400).json('Project is created but employee(s) not assigned')
                }
                return res.status(400).json('Assigned employees are not inserted')
            }

            const employeeNamesResult = await mysqlQuery(/*sql*/`
                SELECT GROUP_CONCAT(name SEPARATOR ', ') AS employeeNames
                FROM users
                WHERE userId IN (?)`, 
                [assignedEmployees], mysqlClient)
            const employeeNames = employeeNamesResult[0]?.employeeNames || 'No employees assigned'
        
            const action = 'created'
            
            const changes = `A new project '${projectName}' was created and member(s) assigned ${employeeNames}`
            const historyEntry = await mysqlQuery(/*sql*/`
                INSERT INTO projectHistorys 
                    (projectId, action, changes, createdBy) 
                VALUES (?, ?, ?, ?)`,
                [projectId, action, changes, createdBy], mysqlClient)
        
            if (historyEntry.affectedRows === 0) {
                return res.status(400).json('Failed to insert history record')
            }
        }
        res.status(201).json('Successfully created.')
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

async function editproject(req, res) {
    const projectId = req.params.projectId
    const mysqlClient = req.app.mysqlClient
    const updatedBy = req.session.user.userId
    let employeeIds = req.body.employeeIds
    const values = []
    const updates = []
    let changes = []

    if (!['admin', 'manager'].includes(req.session.user.role)) {
        return res.status(409).json('User does not have permission to edit a project')
    }

    ALLOWED_UPDATE_KEYS.forEach((key) => {
        keyValue = req.body[key]
        if (keyValue !== undefined) {
            values.push(keyValue)
            updates.push(` ${key} = ?`)
        }
    });

    updates.push('updatedBy = ?')
    values.push(updatedBy, projectId)

    try {
        const projectIsValid = await validateProjectById(projectId, mysqlClient)
        if (!projectIsValid) {
            return res.status(404).json('Project is not found')
        }

        const validationErrors = await validatePayload(req.body, true, projectId, mysqlClient)
        if (validationErrors.length > 0) {
            return res.status(400).json(validationErrors)
        }

        const project = await mysqlQuery(/*sql*/`
            SELECT * FROM projects 
            WHERE projectId = ? AND 
                deletedAt IS NULL`,
            [projectId], mysqlClient)

        if (!project || project.length === 0) {
            return res.status(404).json('Project not found')
        }

        const originalProject = project[0]
   
        for (const key of ALLOWED_UPDATE_KEYS) {
            const newValue = req.body[key]
            const oldValue = originalProject[key]
        
            if (newValue !== undefined && newValue !== oldValue) {
                if (key === 'startDate' || key === 'endDate') {
                    const formattedNew = formatDateLocal(newValue)
                    const formattedOld = formatDateLocal(oldValue)
                    if (formattedNew !== formattedOld) {
                        const label = key === 'startDate' ? 'Start Date' : 'End Date'
                        changes.push(`${label} changed from '${formattedOld}' to '${formattedNew}'`)
                    }
                } else if (key === 'managerId') {
                    const [managerRows] = await Promise.all([
                        mysqlQuery(/*sql*/`SELECT userId, name FROM users WHERE userId IN (?, ?)`, [oldValue, newValue], mysqlClient)
                    ])
                    const oldManager = capitalizeWords(managerRows.find(user => user.userId == oldValue)?.name || oldValue)
                    const newManager = capitalizeWords(managerRows.find(user => user.userId == newValue)?.name || newValue)
                    changes.push(`Manager changed from '${oldManager}' to '${newManager}'`)
                } else {
                    // Label mapping
                    let label = ''
                    if (key === 'projectName') label = 'Project Name'
                    else if (key === 'clientName') label = 'Client Name'
                    else if (key === 'status') label = 'Status'
                    else label = key
        
                    // Capitalize old value if it's "notStarted"
                    const formattedOldValue = oldValue === 'notStarted' ? 'Not Started' : capitalizeWords(oldValue)
                    const formattedNewValue = newValue === 'notStarted' ? 'Not Started' : capitalizeWords(newValue)
        
                    changes.push(`${label} changed from '${formattedOldValue}' to '${formattedNewValue}'`)
                }
            }
        }
        
        const existingEmployees = await mysqlQuery(/*sql*/`
            SELECT employeeId FROM projectEmployees 
            WHERE projectId = ? AND 
                deletedAt IS NULL`,
            [projectId], mysqlClient)

        const existingEmployeeIds = existingEmployees?.map(emp => emp.employeeId)

        const employeesToInsert = employeeIds?.filter(id => !existingEmployeeIds.includes(id))
        const employeesToRemove = existingEmployeeIds?.filter(id => !employeeIds.includes(id))

        if (employeesToInsert.length > 0) {
            const employeeNamesToAdd = await mysqlQuery(/*sql*/`
                SELECT userId, name FROM users 
                WHERE userId IN (?)`,
                [employeesToInsert], mysqlClient)

            const employeeNamesToAddString = capitalizeWords(employeeNamesToAdd.map(emp => emp.name).join(', '))
            changes.push(`Member(s) added: ${employeeNamesToAddString}`)
        }

        if (employeesToRemove.length > 0) {
            const employeeNamesToRemove = await mysqlQuery(/*sql*/`
                SELECT userId, name FROM users 
                WHERE userId IN (?)`,
                [employeesToRemove], mysqlClient)

            const employeeNamesToRemoveString = capitalizeWords(employeeNamesToRemove.map(emp => emp.name).join(', '))
            changes.push(`Member(s) removed: ${employeeNamesToRemoveString}`)
        }

        const updateUser = await mysqlQuery(/*sql*/`
            UPDATE projects SET ${updates.join(', ')} 
            WHERE projectId = ? AND 
                deletedAt IS NULL`,
            values, mysqlClient)

        if (updateUser.affectedRows === 0) {
            return res.status(204).json('No changes made')
        }

        if (employeesToInsert.length > 0) {
            const insertValues = employeesToInsert.map(id => [projectId, id])
            await mysqlQuery(/*sql*/`
                INSERT INTO projectEmployees (projectId, employeeId) VALUES ?`,
                [insertValues], mysqlClient)
        }

        if (employeesToRemove.length > 0) {
            await mysqlQuery(/*sql*/`
                UPDATE projectEmployees SET 
                    deletedAt = NOW() 
                WHERE projectId = ? AND 
                    employeeId IN (?)`,
                [projectId, employeesToRemove], mysqlClient)
        }

        if (changes.length > 0) {
            const action = 'edited'
            const changesText = changes.join(', ')

            const historyEntry = await mysqlQuery(/*sql*/`
                INSERT INTO projectHistorys 
                    (projectId, action, changes, createdBy, updatedBy) 
                VALUES (?, ?, ?, ?, ?)`,
                [projectId, action, changesText, updatedBy, updatedBy], mysqlClient)

            if (historyEntry.affectedRows === 0) {
                return res.status(400).json('Failed to insert history record')
            }
        }
        res.status(200).json('Successfully updated.')
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

async function deleteProjectById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const projectId = req.params.projectId
    const deletedBy = req.session.user.userId

    if (!['admin', 'manager'].includes(req.session.user.role)) {
        return res.status(409).json('User does not have permission to delete project')
    }

    try {
        const projectIsValid = await validateProjectById(projectId, mysqlClient)
        if (!projectIsValid) {
            return res.status(404).json('Project is not found')
        }

        const [project] = await mysqlQuery(/*sql*/`
            SELECT projectName FROM projects 
            WHERE projectId = ? AND 
                deletedAt IS NULL`,
            [projectId], mysqlClient)

        if (!project) {
            return res.status(404).json('Project not found')
        }

        const deletedProject = await mysqlQuery(/*sql*/`
            UPDATE projects SET 
                projectName = CONCAT(IFNULL(projectName, ''), '-', NOW()), 
                deletedAt = NOW(), 
                deletedBy = ?
            WHERE projectId = ? 
            AND deletedAt IS NULL`,
            [deletedBy, projectId]
        , mysqlClient)

        if (deletedProject.affectedRows === 0) {
            return res.status(404).json('No change made')
        }

        const deleteProjectEmployee = await mysqlQuery(/*sql*/`
            UPDATE projectEmployees SET 
                deletedAt = NOW(), 
                deletedBy = ?
            WHERE projectId = ? 
            AND deletedAt IS NULL`,
            [deletedBy, projectId]
        , mysqlClient)

        if (deleteProjectEmployee.affectedRows === 0) {
            return res.status(404).json('Project is deleted but not removed employee(s)')
        }

        const action = 'deleted'
        const changes = `The project '${project.projectName}' has been deleted`
        
        const historyEntry = await mysqlQuery(/*sql*/`
            INSERT INTO projectHistorys (projectId, action, changes, createdBy, deletedAt, deletedBy) 
            VALUES (?, ?, ?, ?, NOW(), ?)`,
            [projectId, action, changes, deletedBy, deletedBy], mysqlClient)

        if (historyEntry.affectedRows === 0) {
            return res.status(400).json('Failed to insert history record')
        }
        res.status(200).json('Deleted successfully')
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}

async function readProjectHistorys(req, res) {
    const mysqlClient = req.app.mysqlClient
    try {
        const projectHistory = await mysqlQuery(/*sql*/`
            SELECT 
                h.*,
                p.projectName AS projectName, 
                ur.name AS createdName,
                h.action AS action,
                DATE_FORMAT(h.createdAt, "%d-%b-%Y %r") AS createdDate,
                CONCAT(h.changes, ' by ', ur.name) AS changesWithCreator
            FROM projectHistorys AS h
            LEFT JOIN projects AS p ON p.projectId = h.projectId
            LEFT JOIN users AS ur ON ur.userId = h.createdBy
            ORDER BY h.createdAt DESC`,
            [], mysqlClient)
        
        const formattedHistory = projectHistory.map(record => ({
            ...record,
            createdName: capitalizeWords(record.createdName),
            changesWithCreator: record.changesWithCreator
        }))
            
        res.status(200).json(formattedHistory)
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error)
    }
}
  

async function validatePayload(body, isUpdate = false, projectId = null, mysqlClient) {
    const errors = []
    const projectName = body.projectName

    try {
        let query, params

        if (isUpdate) {
            query = /*sql*/`
                SELECT 
                    COUNT(*) AS count 
                FROM projects 
                WHERE projectName = ? AND
                    projectId != ? AND 
                    deletedAt IS NULL`
            params = [projectName, projectId]
        } else {
            query = /*sql*/`
                SELECT 
                    COUNT(*) AS count 
                FROM projects 
                WHERE projectName = ? AND
                    deletedAt IS NULL`
            params = [projectName]
        }

        const [validateProjectName] = await mysqlQuery(query, params, mysqlClient)

        if (validateProjectName.count > 0) {
            errors.push('Project Name already exists')
        }

        try {
            await projectValidation.validate(body, { abortEarly: false })
        } catch (err) {
            errors.push(...err.errors)
        }
    } catch (error) {
        return ['Something went wrong. Please try again later']
    }
    return errors
}

async function validateProjectById(projectId, mysqlClient) {
    const [projectIsValid] = await mysqlQuery(/*sql*/`
        SELECT 
            COUNT(*) AS count 
        FROM projects 
        WHERE projectId = ? AND 
            deletedAt IS NULL`, 
    [projectId], mysqlClient)
   
    return projectIsValid.count > 0
}


module.exports = (app) => {
    app.get('/api/projects/history', readProjectHistorys)
    app.get('/api/projects/name', readProjectNames)
    app.get('/api/projects', readProjects)
    app.get('/api/projects/:projectId', readProjectById)
    app.post('/api/projects', createProject)
    app.put('/api/projects/:projectId', editproject)
    app.delete('/api/projects/:projectId', deleteProjectById)
}
