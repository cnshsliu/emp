"use strict";

import Mongoose from "mongoose";

const schema = new Mongoose.Schema({
	//部署站点编码
	site: String,
	//用户当前所属的租户
	tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
	//用户名，显示名，比如中文名字
	username: { type: String, unique: false, required: true },
	//用户登录密码
	password: { type: String, unique: false, required: true },
	//用户的邮箱地址
	email: { type: String, trim: true, lowercase: true, unique: true, required: true },
	// 该邮箱地址是否已验证.
	// 	1。在自由注册模式下，新用户注册后，会受到一封包含验证连接
	// 	的邮件，用户需要点击该连接，验证其邮箱地址。
	// 	2。如是租户管理员在管理界面中手工添加的用户，则邮件地址
	// 	验证直接标注为true
	emailVerified: { type: Boolean, default: false },
	// 在有新工作任务时，是否发送邮件提醒
	ew: { email: { type: Boolean, default: true }, wecom: { type: Boolean, default: false } }, //Send email on new work
	// 每页显示的项目条数，这个数据现在的实现中可能用不上了
	ps: { type: Number, default: 20 }, // Page size
	// 此处的config，在最新的代码中，应该用不上了
	config: {
		keepinput: { type: Boolean, defalt: false },
		keeptemp: { type: Boolean, defalt: true },
	},
	// 用户所属的用户组， 不同用户组用于控制相应权限
	// 在当前的代码中，应该只用到了DOER和ADMIN，以区分普通用户和管理员
	// 未来开发中，一个组织中有哪些用户组，应该由管理员来配置，
	// 而不是在这里用enum固定定义。相应的，不同用户组有什么权限
	// 也应由管理员来配置
	group: {
		type: String,
		enum: ["DOER", "OBSERVER", "ADMIN", "SALES", "BD", "BA", "CS", "LEADER", "NOQUOTA", "NONE"],
		default: "ADMIN",
	},
	// 用户的头像
	avatar: { type: Mongoose.Schema.Types.String },
	// 用户上传的头像
	// 注意历史遗留未澄清：
	// 1. 之前使用avatar，就是一个url，直接作为img的src值
	// 2. 后来支持用户上传，上传后文件信息放在avatarinfo中
	// 3. 但好像代码中还保留了之前的avatar，需要澄清清理
	avatarinfo: { path: String, media: String, etag: { type: String, default: "" } },
	// 用户的签名档图片地址，直接是URL
	signature: { type: Mongoose.Schema.Types.String, default: "" },
	// 当前账号是否为可用状态
	active: { type: Boolean, default: true },
	// 用户离职后，接手人的完整邮箱地址
	succeed: { type: String, default: "" },
	// 接手人的中文名称，
	succeedname: { type: String, default: "" },
});

export default Mongoose.model("User", schema);
