#docker pull nginx
docker run --rm --name nginx1 -p 80:80 -p 443:443 \
  -v /home/ubuntu/ssl:/usr/share/nginx/ssl:ro \
  -v /home/ubuntu/www:/usr/share/nginx/www:ro \
  -v /home/ubuntu/snowflake-hapi-openshift/nginx.conf:/etc/nginx/nginx.conf:ro \
  -d nginx
