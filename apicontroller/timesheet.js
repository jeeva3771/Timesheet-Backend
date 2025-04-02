const { mysqlQuery } = require('../utilityclient/query')

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
        queryParameters.push(toDate);
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


module.exports = (app) => {
    // app.get('/api/projects/history', readProjectHistorys)
    // app.get('/api/projects/name', readProjectNames)
    app.get('/api/timesheets', readTimesheets)
    // app.get('/api/projects/:projectId', readProjectById)
    // app.post('/api/projects', createProject)
    // app.put('/api/projects/:projectId', editproject)
    // app.delete('/api/projects/:projectId', deleteProjectById)
}
