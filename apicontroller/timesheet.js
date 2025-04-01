const { mysqlQuery } = require('../utilityclient/query')

async function readTimesheets(req, res) {    
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
