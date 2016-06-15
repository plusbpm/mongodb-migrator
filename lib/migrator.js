var fs = require("fs");
var mkdirp = require("mkdirp");

var path = require("path");
var mongodb = require("mongodb");

process.env.DEBUG = process.env.DEBUG + " mongodb-migrator:log";

var debugModule = require("debug");
var log = debugModule("mongodb-migrator:log");
var debug = debugModule("mongodb-migrator:migrator.js");

var defaultOptions = require("./defaults");
var Template = require("./template");

module.exports = MongoDBMigrator;

function MongoDBMigrator (options) {
	this.db = null;
	this.opts = Object.assign({}, defaultOptions, options);

	mkdirp.sync(this.opts.directory);
}

MongoDBMigrator.prototype.connect = function () {
	var self = this;

	var mongourl = self.opts.mongourl || "mongodb://"+self.opts.host + ":" + self.opts.port + "/" + self.opts.db;

	return new Promise(function (rsv, rjt) {
		if(self.db) return rsv(self.db);

		mongodb.connect(mongourl, function (err, db) {
			self.db = db;
			if(err) {
				log("Connect to database error: " + err);
				return rjt(err);
			}
			log("Connected");
			rsv(db);
		});

	});
}

MongoDBMigrator.prototype.disconnect = function () {
	if(!this.db) return;
	this.db.close();
	log("Disconnected");
}

MongoDBMigrator.prototype.makeSlug = function (name) {
	return name.replace(/\s+/g,"-");
}

MongoDBMigrator.prototype.filePath = function (name) {
	return path.join(this.opts.directory,this.makeSlug(name)+"."+this.opts.extention);
}

MongoDBMigrator.prototype.exists = function (name) {
	if(typeof name !== 'string') return false;
	try{
		fs.statSync(this.filePath(name));
		return true;
	} catch(e) {
		return false;
	}
}

MongoDBMigrator.prototype.create = function (name, after) {
	if(!name || !name.length) {
		return log("You must specify the name of the migration.");
	}

	var self = this;

	if(this.exists(name)) {
		return log("Migration '"+ name +"' already exists, choose another name.");
	}

	if(typeof after !== "undefined") {
		if(!self.exists(after)) {
			return log("Dependence ' "+ after +"' does not exist, \ u001b [31m cancellation ... \ u001b [39m");
		} else {
			after = self.makeSlug(after);
		}
	}

	var migration = new Template(name, after);

	migration.saveTo(this.filePath(name));

	this.detectCircularity();

	log("Migration '"+name+"' created.");
}

MongoDBMigrator.prototype.loadMigrations = function () {
	var self = this;

	var extentionRex = new RegExp("\\." + self.opts.extention + "$", "gi");

	var filesList = fs.readdirSync(self.opts.directory).filter(function(fileName){
		return fileName.search(extentionRex) > -1;
	});

	return filesList.map(function (fileName) {
		var mig = require(path.join(self.opts.directory,fileName));
		mig.slug = self.makeSlug(mig.name);
		return mig;
	});
}

MongoDBMigrator.prototype.detectCircularity = function () {
	var self = this;

	var migrations = this.loadMigrations();

	var normalMigs = {};
	var normalCnt = 0;

	// нормальные миграции - миграции не участвующие в закольцованности
	while(true) {
		migrations.reduce(function (result, mig) {
			// уже помеченные как нормальные пропускаем
			if(result[mig.slug]) return result;

			// миграция без зависимости, зависящие от нормальной или не существующей зависимости - тоже нормальная
			if(!mig.after || (mig.after && result[mig.after]) || !self.exists(mig.after)) {
				result[mig.slug] = mig;
			}

			return result;
		},normalMigs);

		var newNormalCnt = Object.keys(normalMigs).length;

		if( normalCnt >= newNormalCnt || newNormalCnt >= migrations.length ) break;

		normalCnt = newNormalCnt;
	}

	var circularityMigs = migrations.reduce(function (result, mig) {
		if(!normalMigs[mig.slug]) result.push(mig);
		return result;
	}, []);

	// хранилище закольцованностей
	var circularitys = [];

	while(true) {
		if(!circularityMigs.length) break;

		var circle = [];
		var next = circularityMigs[0];
		var firstkey = next.slug;

		while(true) {
			circle.push(next);

			// фильтрация возможных вариантов следующей миграции в кольце
			var nexts = circularityMigs.filter(function (cmig) {
				return (next.slug == cmig.after);
			},null);

			// берем первый вариант, если есть
			next = nexts[0];

			// вычищаем либо выбраный вариант, либо начальный (для случая когда кольца нет)
			circularityMigs = circularityMigs.filter(function (cmig) {
				return cmig.slug !== (next?next.slug:firstkey);
			});

			// цепочка оборвалась, либо замкнулась
			if(!next || next.slug == firstkey) break;
		}
		// фиксируем только замкнутые цепочки (кольца)
		if(next && next.slug == firstkey) circularitys.push(circle);
	}

	if(circularitys.length) {
		log("\U001b[31mWARNING!\U001b[39m detect traces of 'circularity' depending:");
		circularitys.forEach(function (circ) {
			circ.push(circ[0]);
			log(circ.map(function (mig) {
				return mig.slug
			}).join(' -> '));
		});
	}
	return circularitys;
}

MongoDBMigrator.prototype.check = function () {
	var self = this;
	var circularitys = self.detectCircularity();

	var migrations = self.loadMigrations();

	return self
		.connect()
		.then(function () {
			trackCollection = self.db.collection(self.opts.collectionName);
			return trackCollection.find().toArray();
		}).then(function (dbData) {
			var newMigrations = migrations.filter(function (mig) {
				return dbData.reduce(function (result, item) {
					if(item.slug == mig.slug) result = false;
					return result;
				}, true);
			});
			if(newMigrations.length) {
				log("There are new migration - " + newMigrations.length);
			} else {
				log("No new migration.");
			}
			return newMigrations.length;
		});
}

MongoDBMigrator.prototype.apply = function () {
	var self = this;

	var circularitys = self.detectCircularity();
	if(circularitys.length) return;

	var migrations = this.loadMigrations();
	var applied = {};
	var marked = {};
	var seriesMigrations = [];

	var trackCollection = null;
	
	return self
		.connect()
		.then(function () {
			trackCollection = self.db.collection(self.opts.collectionName);
			return trackCollection.find().toArray();
		}).then(function (dbData) {
			// группируем приминеные миграции
			dbData.forEach(function (item) {
				applied[item.slug] = item;
			});
			// помечаем уже приминенные миграции
			migrations.forEach(function (mig) {
				if(applied[mig.slug]) marked[mig.slug] = mig;
			});
			while(true) {
				// берем список непомеченых наследников от помеченых, либо миграции без родителя
				var nextList = migrations.filter(function (mig) {
					return !marked[mig.slug] && (!mig.after || !!marked[mig.after]);
				});
				if(!nextList.length) break;
				
				// помечаем миграции и помещаем в последоватеный список
				nextList.forEach(function (mig) {
					marked[mig.slug] = mig;
					seriesMigrations.push(mig);
				});
			}
			log("Application migration.");
			return seriesMigrations.reduce(function(chain, mig) {
				chain = chain.then(function(){
					return new Promise(function(rsv, rjt){
						mig.up(self.db, rsv);
					}).then(function(err){
						if(err) {
							err.mig = mig;
							throw(err);
						} else {
							debug("'"+mig.name+"'");
						}
						return trackCollection.insertOne({
							name: mig.name,
							slug: mig.slug,
							after: mig.after,
							ts: new Date()
						});
					});
				});
				return chain;
			}, Promise.resolve());
		}).then(function(){
			log("Application migration is completed successfully.");
		}).catch(function(err) {
			if(err.mig) {
				log("Error applying migration '"+err.mig.name+"'");
			} else {
				return log("Error " + err);
			}
			log("Rolling back migration");
			var inx = seriesMigrations.indexOf(err.mig);
			var rollbackMigrations = seriesMigrations.slice(0,inx+1).reverse();

			return rollbackMigrations.reduce(function(chain, mig) {
				chain = chain.then(function(){
					return new Promise(function(rsv, rjt){
						mig.down(self.db, rsv);
					}).then(function(err){
						if(err) {
							log("Error migration rollback '"+mig.name+"': " + err);
						} else {
							debug("Rollback - '"+mig.name+"'");
						}
						return trackCollection.removeOne({
							slug: mig.slug
						});
					});
				});
				return chain;
			}, Promise.resolve());

		});
}