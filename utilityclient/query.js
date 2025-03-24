const bcrypt = require('bcrypt')

function mysqlQuery(sql, options, mysqlClient) {
    return new Promise((resolve, reject) => {
        try {
            mysqlClient.query(sql, options || [], (err, data) => {
                if (err) {
                    return reject(err.sqlMessage)
                }
                resolve(data)
            })
        } catch (error) {
            reject(error.message)
        }
    })
}

function deleteFile(path, fs) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(path)) {
            return resolve()
        }

        fs.unlink(path, (err) => {
            if (err) {
                return reject(err)
            }
            resolve()
        })
    })
}

function hashPassword(password) {
    return bcrypt.hash(password, parseInt(process.env.HASH_SALTROUNDS))
}

function isPasswordValid(enteredPassword, storedHashedPassword) {
    return bcrypt.compare(enteredPassword, storedHashedPassword)
}

module.exports = {
    mysqlQuery,
    deleteFile,
    hashPassword,
    isPasswordValid
}