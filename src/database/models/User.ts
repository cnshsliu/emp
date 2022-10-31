"use strict";

import Mongoose from "mongoose";

const schema = new Mongoose.Schema({
	//部署站点编码
	site: String,
	//用户名，显示名，比如中文名字
	username: { type: String, unique: false, required: true },
	//用户登录密码
	password: { type: String, unique: false, required: true },
	//用户的邮箱地址
	email: { type: String, trim: true, lowercase: true, unique: true },
	// 该邮箱地址是否已验证.
	// 	1。在自由注册模式下，新用户注册后，会受到一封包含验证连接
	// 	的邮件，用户需要点击该连接，验证其邮箱地址。
	// 	2。如是租户管理员在管理界面中手工添加的用户，则邮件地址
	// 	验证直接标注为true
	emailVerified: { type: Boolean, default: false },
	// 手机验证码
	phone: {
		type: String,
		unique: true,
		required: false,
	},
	// 填入手机时候，做个短信验证
	phoneVerified: { type: Boolean, default: false },
	// 在有新工作任务时，是否发送邮件提醒
	ew: { email: { type: Boolean, default: true }, wecom: { type: Boolean, default: false } }, //Send email on new work
	// 每页显示的项目条数，这个数据现在的实现中可能用不上了
	ps: { type: Number, default: 20 }, // Page size
	// 此处的config，在最新的代码中，应该用不上了
	config: {
		keepinput: { type: Boolean, defalt: false },
		keeptemp: { type: Boolean, defalt: true },
	},
	// 微信授权登录的openid
	openId: { type: String, default: "",  },
	// 微信授权登录的unionId
	unionId: { type: String, default: "" },
	// 最后登录的组织
	tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" }
});

export default Mongoose.model("User", schema);
