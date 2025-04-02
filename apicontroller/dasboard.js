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
            return res.status(404).send(`No ${manager ? 'manager' : 'employee'} found`)
        }
        res.status(200).send(count)
    } catch (error) {
        console.log(error)
        req.log.error(error)
        res.status(500).send(error.message)
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
            return res.status(404).send(`No project found`)
        }
        res.status(200).send(count)
    } catch (error) {
        req.log.error(error)
        res.status(500).send(error.message)
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
            return res.status(404).send(`No client found`)
        }
        res.status(200).send(count)
    } catch (error) {
        console.log(error)
        req.log.error(error)
        res.status(500).send(error.message)
    }
}


module.exports = (app) => {
    app.get('/api/count/managerandemployee', readManagerAndEmployeeCount)
    app.get('/api/count/projects', readProjectCount)
    app.get('/api/count/clients', readClientCount)

}