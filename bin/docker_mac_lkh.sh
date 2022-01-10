#docker pull mongo
docker run --rm -d --name mongo1 -p 27017:27017 -v /home/ubuntu/volumes/mdata:/data/db  -v /home/ubuntu/backup:/backup mongo --auth
#docker run --rm -d --name mongo1 -p 27017:27017 -v /home/ubuntu/volumes/mdata:/data/db mongo --auth

#docker pull redis
docker run -d --rm --name redis1 -p 16379:6379 \
    -v /home/ubuntu/volumes/rdata:/data \
    -v redis.conf:/etc/redis/redis.conf \
    redis redis-server /etc/redis/redis.conf --appendonly yes
#docker pull rabbit
#docker run --rm -d --hostname rabbit1 --name rabbit1 -p 5672:5672 rabbitmq
