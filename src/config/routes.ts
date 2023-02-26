"use strict";
import GeneralRoutes from "../routes/general/endpoints";
import AccountRoutes from "../routes/account/endpoints";
import EngineRoutes from "../routes/engine/endpoints";
import DelegationRoutes from "../routes/delegation/endpoints";
import FilesRoutes from "../routes/files/endpoints";
import MenuRoutes from "../routes/menu/endpoints";
import ShareRoutes from "../routes/share/endpoints";
import TryRoutes from "../routes/try/endpoints";

const Routes = {
	//Concatentate the routes into one array
	//set the routes for the server
	init: async function (server) {
		let allRoutes = [].concat(
			GeneralRoutes.endpoints,
			AccountRoutes.endpoints,
			EngineRoutes.endpoints,
			DelegationRoutes.endpoints,
			FilesRoutes.endpoints,
			MenuRoutes.endpoints,
			ShareRoutes.endpoints,
			TryRoutes.endpoints,
		);
		await server.route(allRoutes);
	},
};

export default Routes;
