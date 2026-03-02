#!/bin/sh

# Start the main server
node server/index.js &

# Start the CORS proxy
node proxy.js &

# Keep the container alive
wait
