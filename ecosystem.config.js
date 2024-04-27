module.exports = {
    apps: [
      {
        name: "dao_expire",
        script: "npm",
        args: "start",
        env: {
          NODE_ENV: "production",
        },
      },
    ],
  };
  