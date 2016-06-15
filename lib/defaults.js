var path = require("path");
var defaultDbName = "migrations";

module.exports = {
	mongourl: "mongodb://localhost:27017/" + defaultDbName,
	host: "localhost",
	port: 27017,
	db: defaultDbName,
	collection: "migrations_track",
	directory: path.join(process.cwd(),"migrations"),
	extention: "js"
}