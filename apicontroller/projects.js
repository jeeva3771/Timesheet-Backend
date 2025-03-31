const { mysqlQuery } = require('../utilityclient/query')
const yup = require('yup')

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
    projectName: yup.string().min(2, 'Project name must be at least 2 characters long'),
    clientName: yup.string().min(2, 'Client name must be at least 2 characters long'),
    managerId: yup.number().integer('Manager ID must be a number').positive('Manager ID must be positive'),
    employeeIds: yup.array()
        .of(
            yup.number()
                .integer('Each Employee ID must be an integer')
        )
        .required('Employee IDs list is required')
        .test('all-positive', 'All Employee IDs must be positive', value => 
            Array.isArray(value) && value.length > 0 && value.every(id => Number.isInteger(id) && id > 0)
        ),
    startDate: yup.date().required('Start date is required'),
    endDate: yup.date()
        .min(yup.ref('startDate'), 'End date cannot be before start date')
        .required('End date is required'),
    status: yup.mixed()
        .oneOf(['onGoing', 'completed', 'onHold', 'notStarted'], 'Invalid status')
        .required('Status is required')
})

async function readProjects(req, res) {    
    const mysqlClient = req.app.mysqlClient
    const limit = req.query.limit ? parseInt(req.query.limit) : null
    const page = req.query.page ? parseInt(req.query.page) : null
    const offset = limit && page ? (page - 1) * limit : null
    const orderBy = req.query.orderby
    const sort = req.query.sort
    const searchQuery = req.query.search || ''
    const searchPattern = `%${searchQuery}%`
    let queryParameters = null
    
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
            (p.projectName LIKE ? OR u.name LIKE ? OR u2.name LIKE ? OR ue.name LIKE ?)
        GROUP BY p.projectId
        ORDER BY ${orderBy} ${sort}`
        
        let countQuery = /*sql*/`
            SELECT COUNT(*) AS totalProjectCount
            FROM (
                SELECT p.projectId
                FROM projects AS p
                LEFT JOIN users AS u ON u.userId = p.createdBy
                LEFT JOIN users AS u2 ON u2.userId = p.managerId
                LEFT JOIN projectEmployees AS pe ON pe.projectId = p.projectId
                LEFT JOIN users AS ue ON ue.userId = pe.employeeId        
                WHERE 
                    p.deletedAt IS NULL AND 
                    (p.projectName LIKE ? OR u.name LIKE ? OR u2.name LIKE ? OR ue.name LIKE ?)
                GROUP BY p.projectId
                LIMIT ? OFFSET ?
            ) AS limitedProjects`

    if (limit >= 0) {
        projectsQuery += ' LIMIT ? OFFSET ?'
        queryParameters = [searchPattern, searchPattern, searchPattern,
            searchPattern, limit, offset]
    } else {
        queryParameters = [searchPattern, searchPattern, searchPattern,
            searchPattern]
    }

    const countQueryParameters = [searchPattern, searchPattern, searchPattern, 
        searchPattern, limit, offset]

    try {
        const [projects, totalCount] = await Promise.all([
            mysqlQuery(projectsQuery, queryParameters, mysqlClient),
            mysqlQuery(countQuery, countQueryParameters, mysqlClient)
        ])

        res.status(200).send({
            projects: projects,
            projectCount: totalCount[0].totalProjectCount
        })

    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function readProjectById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const projectId = req.params.projectId

    try {
        const [project] = await mysqlQuery(/*sql*/`
            SELECT 
                p.*,
                ur.name AS createdName,
                ur2.name AS updatedName,
                ur3.name AS managerName,
                GROUP_CONCAT(ue.name ORDER BY ue.name SEPARATOR ', ') AS assignedEmployees,
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
            AND p.projectId = ?
            GROUP BY p.projectId`, 
            [projectId], mysqlClient)
            
        res.status(200).send(project)
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
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
        return res.status(409).send('User does not have permission to create a project')
    }

    try {
        const validationErrors = await validatePayload(req.body, false, null, mysqlClient)
        if (validationErrors.length > 0) {
            return res.status(400).send(validationErrors)
        }

        const newProject = await mysqlQuery(/*sql*/`
            INSERT INTO projects 
                (projectName, clientName, managerId, startDate, endDate, status, createdBy)
            values(?, ?, ?, ?, ?, ?, ?)`,
            [projectName, clientName, managerId, startDate, endDate, status, createdBy], mysqlClient)
        
        if (newProject.affectedRows === 0) {
            return res.status(400).send('No insert was made')
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
                    return res.status(400).send('Project is created but employee(s) not assigned')
                }
                return res.status(400).send('Assigned employees are not inserted')
            }
        }
        res.status(201).send('Successfully created.')
    } catch (error) {
        console.log(error)
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function editproject(req, res) {
    const projectId = req.params.projectId
    const mysqlClient = req.app.mysqlClient
    const updatedBy = req.session.user.userId
    const values = []
    const updates = []

    if (!['admin', 'manager'].includes(req.session.user.role)) {
        return res.status(409).send('User does not have permission to edit a project')
    }

    ALLOWED_UPDATE_KEYS.forEach((key) => {
        keyValue = req.body[key]
        if (keyValue !== undefined) {
            values.push(keyValue)
            updates.push(` ${key} = ?`)
        }
    })

    updates.push('updatedBy = ?')
    values.push(updatedBy, projectId)

    try {
        const projectIsValid = await validateProjectById(projectId, mysqlClient)
        if (!projectIsValid) {
            return res.status(404).send('Project name is not found')
        }

        const validUpdate = await validatePayload(req.body, true, projectId, mysqlClient)
        if (validUpdate.length > 0) {
            return res.status(400).send(validUpdate)
        }

        const updateUser = await mysqlQuery(/*sql*/`
            UPDATE 
                projects SET ${updates.join(', ')} 
            WHERE projectId = ? AND 
                deletedAt IS NULL`,
            values, mysqlClient)

        if (updateUser.affectedRows === 0) {
            return res.status(204).send('No changes made')
        }
        res.status(200).send('Successfully updated.')
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

async function deleteProjectById(req, res) {
    const mysqlClient = req.app.mysqlClient
    const projectId = req.params.projectId
    const deletedBy = req.session.user.userId

    if (!['admin', 'manager'].includes(req.session.user.role) && userId !== req.session.user.userId) {
        return res.status(409).send('User does not have permission to delete project')
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


async function validatePayload(body, isUpdate = false, projectId = null, mysqlClient) {
    const errors = []
    const projectName = body.projectName
    try {
        await projectValidation.validate(body, { abortEarly: false })
    } catch (err) {
        errors.push(...err.errors)
    }

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
    app.get('/api/projects', readProjects)
    app.get('/api/projects/:projectId', readProjectById)
    app.post('/api/projects', createProject)
    app.put('/api/projects/:projectId', editproject)
    // app.delete('/api/users/:userId', deleteUserById)
    // app.delete('/api/users/deleteavatar/:userId', deleteUserAvatar)
    
}
