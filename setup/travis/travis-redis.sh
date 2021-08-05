#!/bin/sh

echo "Setting up Redis instances on ports 6379 and 6380..."

# Based on https://learn.jetrails.com/article/multiple-redis-servers-with-systemd

# Disable the default Redis service

sudo systemctl stop redis-server
sudo systemctl disable redis-server
sudo mkdir -p /etc/redis/{redis-server.pre-up.d,redis-server.post-down.d,redis-server.post-up.d,redis-server.pre-down.d}
sudo mkdir -p /var/lib/{redis-cache,redis-sessions}

# Redis config

REDIS_SOURCE=${TRAVIS_BUILD_DIR}/setup/redis/conf
REDIS_TARGET=/etc/redis

sudo cp $REDIS_SOURCE/redis-enketo-cache.conf $REDIS_TARGET/enketo-cache.conf
sudo cp $REDIS_SOURCE/redis-enketo-main.conf $REDIS_TARGET/enketo-main.conf

# Systemd config

SYSTEMD_SOURCE=${TRAVIS_BUILD_DIR}/setup/redis/systemd
SYSTEMD_TARGET=/lib/systemd/system
sudo cp $SYSTEMD_SOURCE/redis-enketo-cache.service $SYSTEMD_TARGET/redis-enketo-cache.service
sudo cp $SYSTEMD_SOURCE/redis-enketo-main.service $SYSTEMD_TARGET/redis-enketo-main.service

# Enable and start Redis services

sudo systemctl enable redis-enketo-cache.service redis-enketo-main.service
sudo systemctl start redis-enketo-cache.service redis-enketo-main.service || systemctl status redis-enketo-cache.service

sleep 3

redis-cli -p 6379 ping

MAIN_STATUS=$?

if [ "$MAIN_STATUS" = "0" ]
then
    echo "Redis is running on port 6379"
else
    echo "Redis failed to start on port 6379"
    cat /var/log/redis/redis-enketo-cache.log
    journalctl -xe
    exit 1
fi

redis-cli -p 6380 ping

CACHE_STATUS=$?

if [ "$CACHE_STATUS" = "0" ]
then
    echo "Redis is running on port 6380"
else
    echo "Redis failed to start on port 6380"
    cat /var/log/redis/redis-enketo-cache.log
    journalctl -xe
    exit 1
fi
