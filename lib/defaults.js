var path = require("path");

module.exports = {
	port: 27017,
	db: "migrations",
	directory: path.join(process.cwd(),"migrations"),
	extention: "js"
}