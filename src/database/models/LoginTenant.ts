"use strict";
import Mongoose from "mongoose";

const schema = new Mongoose.Schema({
	// 用户id
	userid: { type: String, ref: "User" },
	inviterid: {
		type: String
	},
	// 用户当前所属的租户
	tenant: { type: Mongoose.Schema.Types.ObjectId, ref: "Tenant" },
	// 用户在组织的Id。比如：工号等唯一标识，自动生成
	groupid: { type: String, unique: true },
	// 企业备注昵称
	nickname: {
		type: String
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
	// 用户上传的头像，相对路径
	// 注意历史遗留未澄清：
	// 1. 之前使用avatar，就是一个url，直接作为img的src值
	// 2. 后来支持用户上传，上传后文件信息放在avatarinfo中
	// 3. 但好像代码中还保留了之前的avatar，需要澄清清理
	avatarinfo: { path: String, media: String, etag: { type: String, default: "" } },
	// 用户的签名档图片地址，直接是URL
	signature: { type: Mongoose.Schema.Types.String, default: "" },
    // 当前账号是否为可用状态
	active: { type: Boolean, default: true },
	// 用户离职后，接手人的groupId
	succeed: { type: String, default: "" },
	// 接手人的中文名称
	succeedname: { type: String, default: "" },
});

export default Mongoose.model("LoginTenant", schema);