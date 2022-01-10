/**
 * # Mimo.js
 *
 * The mimo document for Mongoose
 *
 *
'use strict';
/**
 * ## Imports
 *
 */
const Joi = require('joi');
//Mongoose - the ORM
var Mongoose = require('mongoose'),
    //The document structure definition
    Schema = Mongoose.Schema;

var uniqueValidator = require('mongoose-unique-validator');
var crypto = require('crypto');

//Same fields as Parse.com
var MimoSchema = new Schema({
  uname: {type: String, lowercase: true, unique: true, required: [true, "不能为空"], match: [/^[a-zA-Z0-9]+$/, 'is invalid'], index:true},
  avatar: String,
  nick: {type: String, unique: false, required: true},
  balance:{type: Number, default: 0},
  plays: [{type: Mongoose.Schema.Types.ObjectId, ref: 'Play'}],
  sp: {type: Number, default: 0},
  hash: String,
  salt: String
}, {timestamps: true});

MimoSchema.plugin(uniqueValidator, {message: '已经被占用.'});
MimoSchema.methods.validPassword = function (password) {
  var hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
  return this.hash === hash;
}

MimoSchema.methods.setPassword = function (password) {
  this.salt = crypto.randomBytes(16).toString('hex');
  this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
}

MimoSchema.statics.login = async function (uname, password) {
  let that = this;
  //let filter = {uname:  uname};
  const mimo = await this.findOne({ uname: uname });
  if(!mimo){
      throw new Error('用户名或密码错误');
  }else{
    if(mimo.validPassword(password)){
      return (({_id, uname, nick, balance})=>({_id, uname, nick, balance}))(mimo);
    }else
      throw new Error('用户名或密码错误');
  }
}

MimoSchema.statics.splogin = async function (uname, password) {
  let that = this;
  let filter = {uname:  uname, sp: 1};
  console.log('splogin: ' + JSON.stringify(filter));
  const mimo = await this.findOne(filter);
  if(!mimo){
      throw new Error('用户名不存在');
  }else{
    if(mimo.validPassword(password)){
      return (({_id, uname, nick, balance})=>({_id, uname, nick, balance}))(mimo);
    }else
      throw new Error('用户名或密码错误');
  }
}

MimoSchema.methods.play = function (id) {
  if (this.plays.indexOf(id) === -1) {
    this.plays.push(id);
  }
  return this.save();
}

/**
 * ## Mongoose model for Mimo
 *
 * @param MimoSchema - the document structure definition
 *
 */
var mimo = Mongoose.model('Mimo', MimoSchema);

module.exports = mimo;
