module.exports = {
  apps: [{
    name: 'catfish-bot',
    script: 'npm',
    args: 'run start',
    restart_delay: 5000,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
    },
  }],
};
