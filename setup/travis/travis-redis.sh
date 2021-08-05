#!/bin/sh

echo "Setting up Redis instances on ports 6379 and 6380..."

# Based on setup/vagrant/bootstrap.sh

sudo systemctl stop redis-server
sudo systemctl disable redis-server
sudo systemctl daemon-reload

REDIS_SOURCE=${TRAVIS_BUILD_DIR}/setup/redis/conf

sudo cp -f $REDIS_SOURCE/redis-enketo-main.conf /etc/redis/enketo-main.conf
sudo cp -f $REDIS_SOURCE/redis-enketo-cache.conf /etc/redis/enketo-cache.conf

SYSTEMD_SOURCE=${TRAVIS_BUILD_DIR}/setup/redis/systemd

sudo cp -f $SYSTEMD_SOURCE/redis-server.unit /lib/systemd/system/
sudo cp -f $SYSTEMD_SOURCE/redis-server@.target /lib/systemd/system/

sudo systemctl enable redis-server@enketo-main.service redis-server@enketo-cache.service
sudo systemctl start redis-server@enketo-main.service redis-server@enketo-cache.service
