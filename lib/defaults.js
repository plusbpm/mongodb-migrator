var path = require("path");

module.exports = {
	port: 27017,
	db: "migrations",
	collectionName: "migrations_track",
	directory: path.join(process.cwd(),"migrations"),
	extention: "js"
}