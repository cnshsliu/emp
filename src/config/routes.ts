"use strict";
import GeneralRoutes from "../routes/general/endpoints";
import AccountRoutes from "../routes/account/endpoints";
import EngineRoutes from "../routes/engine/endpoints";
import DelegationRoutes from "../routes/delegation/endpoints";
import FilesRoutes from "../routes/files/endpoints";
import MenuRoutes from "../routes/menu/endpoints";
import ShareRoutes from "../routes/share/endpoints";
import TryRoutes from "../routes/try/endpoints";
import YanaRoutes from "../routes/yana/endpoints";
import SignatureRoutes from "../routes/signature/endpoints";
import DataRoutes from "../routes/data/endpoints";
import SnapshotRoutes from "../routes/snapshot/endpoints";

const Routes = {
	//Concatentate the routes into one array
	//set the routes for the server
	init: async function (server: any) {
		let allRoutes = [].concat(
			GeneralRoutes.endpoints,
			AccountRoutes.endpoints,
			EngineRoutes.endpoints,
			DelegationRoutes.endpoints,
			FilesRoutes.endpoints,
			MenuRoutes.endpoints,
			ShareRoutes.endpoints,
			TryRoutes.endpoints,
			YanaRoutes.endpoints,
			SignatureRoutes.endpoints,
			DataRoutes.endpoints,
			SnapshotRoutes.endpoints,
		);
		await server.route(allRoutes);
	},
};

export default Routes;
