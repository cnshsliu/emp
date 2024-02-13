const zmq = require("zeromq");

async function run() {
	const sock = new zmq.Publisher();

	await sock.bind("tcp://127.0.0.1:3002");
	console.log("Publisher bound to port 3002");

	let i = 0;
	while (true) {
		console.log("sending a multipart message envelope");
		await sock.send(["kitty cats", "meow!" + i++]);
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

run();
