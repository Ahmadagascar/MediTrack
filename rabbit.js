const amqp = require("amqplib");

const RABBIT_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const EXCHANGE = "meditrack.events";
const QUEUE = "meditrack.tasks";

let connectionPromise;
let channelPromise;

async function getChannel() {
  if (!connectionPromise) {
    connectionPromise = amqp.connect(RABBIT_URL);
  }
  if (!channelPromise) {
    channelPromise = connectionPromise.then(async connection => {
      const channel = await connection.createChannel();
      await channel.assertExchange(EXCHANGE, "topic", { durable: true });
      await channel.assertQueue(QUEUE, { durable: true });
      await channel.bindQueue(QUEUE, EXCHANGE, "appointment.*");
      await channel.bindQueue(QUEUE, EXCHANGE, "chat.*");
      return channel;
    });
  }
  return channelPromise;
}

async function publishEvent(routingKey, payload) {
  const channel = await getChannel();
  const body = Buffer.from(JSON.stringify({
    ...payload,
    eventType: routingKey,
    publishedAt: new Date().toISOString()
  }));
  return channel.publish(EXCHANGE, routingKey, body, {
    contentType: "application/json",
    persistent: true
  });
}

async function consumeEvents(handler) {
  const channel = await getChannel();
  channel.prefetch(10);
  await channel.consume(QUEUE, async message => {
    if (!message) return;
    try {
      const payload = JSON.parse(message.content.toString());
      await handler(payload);
      channel.ack(message);
    } catch (error) {
      console.error("RabbitMQ worker failed:", error.message);
      channel.nack(message, false, false);
    }
  });
}

module.exports = {
  EXCHANGE,
  QUEUE,
  consumeEvents,
  publishEvent
};
