const { mysqlQuery } = require('../utilityclient/query')

async function readManagerAndEmployeeCount(req, res) {
    const mysqlClient = req.app.mysqlClient
    const manager = req.query.manager === 'true'
    const active = req.query.active === 'true'
    try {
        let countQuery = /*sql*/`
            SELECT COUNT(*) AS totalCount
            FROM users 
            WHERE deletedAt IS NULL AND`

        if (manager) {
            countQuery += " (role = 'admin' OR role = 'manager')"
        } else {
            countQuery += " (role = 'hr' OR role = 'employee')"
        }

        if (active) {
            countQuery += " AND status = '1'"   
        }

        const [count] = await mysqlQuery(countQuery, [], mysqlClient)

        if (count.totalCount === 0) {
            return res.status(404).json(`No ${manager ? 'manager' : 'employee'} found`)
        }
        res.status(200).json(count)
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error.message)
    }
}

async function readProjectCount(req, res) {
    const mysqlClient = req.app.mysqlClient
    const completed = req.query.completed === 'true'
    try {
        let countQuery = /*sql*/`
            SELECT COUNT(*) AS totalProjectCount
            FROM projects 
            WHERE deletedAt IS NULL`

        if (completed) {
            countQuery += " AND status = 'completed'"
        }
        
        const [count] = await mysqlQuery(countQuery, [], mysqlClient)

        if (count.totalProjectCount === 0) {
            return res.status(404).json(`No project found`)
        }
        res.status(200).json(count)
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error.message)
    }
}

async function readClientCount(req, res) {
    const mysqlClient = req.app.mysqlClient

    try {
        let countQuery = /*sql*/`
            SELECT COUNT(DISTINCT clientName) AS totalClientCount
            FROM projects 
            WHERE deletedAt IS NULL`
        
        const [count] = await mysqlQuery(countQuery, [], mysqlClient)

        if (count.totalClientCount === 0) {
            return res.status(404).json(`No client found`)
        }
        res.status(200).json(count)
    } catch (error) {
        req.log.error(error)
        res.status(500).json(error.message)
    }
}


module.exports = (app) => {
    app.get('/api/counts/users', readManagerAndEmployeeCount)
    app.get('/api/counts/projects', readProjectCount)
    app.get('/api/counts/clients', readClientCount)

}