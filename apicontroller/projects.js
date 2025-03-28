const { mysqlQuery } = require('../utilityclient/query')

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
            u3.name AS employeeName,
            DATE_FORMAT(p.startDate, "%d-%b-%Y") AS projectStart,
            DATE_FORMAT(p.endDate, "%d-%b-%Y") AS projectEnd
        FROM projects AS p
        LEFT JOIN users AS u ON u.userId = p.createdBy
        LEFT JOIN users AS u2 ON u2.userId = p.managerId
        LEFT JOIN users AS u3 ON u3.userId = p.employeeId
        WHERE 
            p.deletedAt IS NULL AND 
            (p.projectName LIKE ? OR u.name LIKE ? OR u2.name LIKE ? OR u3.name LIKE ?)
        ORDER BY ${orderBy} ${sort}`
        
    const countQuery = /*sql*/`
        SELECT
            COUNT(*) AS totalProjectCount
        FROM 
            projects AS p
        LEFT JOIN users AS u ON u.userId = p.createdBy
        LEFT JOIN users AS u2 ON u2.userId = p.managerId
        LEFT JOIN users AS u3 ON u3.userId = p.employeeId
        WHERE 
            p.deletedAt IS NULL AND 
            (p.projectName LIKE ? OR u.name LIKE ? OR u2.name LIKE ? OR u3.name LIKE ?)
        ORDER BY ${orderBy} ${sort}`


    if (limit >= 0) {
        projectsQuery += ' LIMIT ? OFFSET ?'
        queryParameters = [searchPattern, searchPattern, searchPattern,
            searchPattern, limit, offset]
    } else {
        queryParameters = [searchPattern, searchPattern, searchPattern,
            searchPattern]
    }
    const countQueryParameters = [searchPattern, searchPattern, searchPattern,
        searchPattern]

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
    const userId = req.params.userId

    try {
        const [project] = await mysqlQuery(/*sql*/`
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
            
        res.status(200).send(project)
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error)
    }
}

module.exports = (app) => {
    app.get('/api/projects', readProjects)
    // app.get('/api/users/:userId', readUserById)
    // app.post('/api/users', createUser)
    // app.put('/api/users/:userId', multerMiddleware, editUser)
    // app.delete('/api/users/:userId', deleteUserById)
    // app.delete('/api/users/deleteavatar/:userId', deleteUserAvatar)
    
}
