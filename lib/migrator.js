var fs = require("fs");
var mkdirp = require("mkdirp");

var path = require("path");
var debugModule = require("debug");
var log = debugModule.log;
var debug = debugModule("mongodb-migrator:migrator.js");

var defaultOptions = require("./defaults");
var Template = require("./template");

module.exports = MongoDBMigrator;

function MongoDBMigrator (options) {
	if(!options) {
		return log("Нужно указать опции в качестве аргумента.");
	}
	if(!options.host && !options.mongourl) {
		return log("В опциях должен быть mongourl либо host.");
	}
	this.db = null;
	this.opts = Object.assign({}, defaultOptions, options);

	mkdirp.sync(this.opts.directory);
}

MongoDBMigrator.prototype.makeSlug = function (name) {
	return name.replace(/\s+/g,"-");
}

MongoDBMigrator.prototype.filePath = function (name) {
	return path.join(this.opts.directory,this.makeSlug(name)+"."+this.opts.extention);
}

MongoDBMigrator.prototype.exists = function (name) {
	try{
		fs.statSync(this.filePath(name));
		return true;
	} catch(e) {
		return false;
	}
}

MongoDBMigrator.prototype.create = function (name, after) {
	if(!name || !name.length) {
		return log("Нужно указать название миграции.");
	}
	if(!after) {
		after = [];
	}

	var self = this;

	after = after.filter(function (depName) {
		var exists = self.exists(depName);
		if(!exists) {
			log("Зависимость '"+depName+"' не существует, \u001b[31m пропущена ... \u001b[39m");
		}
		return exists;
	});

	after = after.map(function(depName){return self.makeSlug(depName) });

	if(this.exists(name)) {
		return log("Миграция '"+name+"' уже существует, выберите другое название.");
	}

	var migration = new Template(name, after);

	migration.saveTo(this.filePath(name));

	this.detectCircularity();

	log("Миграция '"+name+"' создана.");
}

MongoDBMigrator.prototype.detectCircularity = function () {
	var self = this;

	var migrations = this.loadMigrations().map(function (mig) {
		mig.slug = self.makeSlug(mig.name);
		return mig;
	});

	var normalMigs = {};
	var normalCnt = 0;

	// нормальные миграции - миграции не участвующие в закольцованности
	while(true) {
		migrations.reduce(function (result, mig) {
			// уже помеченные как нормальные пропускаем
			if(result[mig.slug]) return result;

			// миграции без зависимостей сразу нормальные
			var isnormal = true;
			
			// миграции зависящие только от нормальных, тоже нормальные
			if(mig.after.length){
				isnormal = mig.after.reduce(function (normal, sn) {
					if(!result[sn]) normal = false;
					return normal;
				}, true);
			}

			// помечаем миграцию нормальной
			if(isnormal) result[mig.slug] = mig;

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
				return cmig.after.reduce(function (isis, sn) {
					return next.slug == sn || isis;
				},false);
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
		log("\u001b[31mВНИМАНИЕ!\u001b[39m Обнаружены следующие 'закольцованности' в зависимостях:");
		circularitys.forEach(function (circ) {
			circ.push(circ[0]);
			log(circ.map(function (mig) {
				return mig.slug
			}).join(' -> '));
		});
	}
}

MongoDBMigrator.prototype.up = function (name) {
	this.runMigration("up", name);
}

MongoDBMigrator.prototype.down = function (name) {
	this.runMigration("down", name);
}

MongoDBMigrator.prototype.loadMigrations = function () {
	var self = this;

	var extentionRex = new RegExp("\\." + self.opts.extention + "$", "gi");

	var filesList = fs.readdirSync(self.opts.directory).filter(function(fileName){
		return fileName.search(extentionRex) > -1;
	});

	return filesList.map(function (fileName) {
		return require(path.join(self.opts.directory,fileName));
	});
}

MongoDBMigrator.prototype.runMigration = function (name) {

}