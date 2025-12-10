# 1.  Download from https://github.com/EvolutionAPI/evolution-api.git .
# 2.  Download manager from https://github.com/EvolutionAPI/evolution-manager-v2/ or the right tree ( check on the evolution-api main branch)
# 3.  Install postgresql (sudo dnf install -y postgresql15 postgresql15-server)
# 4.  Create postgresql user / superuser/ grant permissions / change login mode (pg_hba.conf//var/lib/pgsql/data/pg_hba.conf -> change method from ident/perr to md5)
## 4.5 (sudo su postgresql) (psql) (CREATE USER myuser WITH PASSWORD 'mypassword';) (ALTER USER myuser CREATEDB;)
# 5.  copy .env.example to .env and add redis and postgresql connection strings
# 6.  install nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# 7.  carrega nvm: source ~/.bashrc
# 8.  nvm install v24.11.1 && nvm use v24.11.1
# 9.  npm install
# 10. npm run db:generate
# 11. npm run db:deploy
# 12. npm run build
# 13. bash manager_install.sh
# 14. npm run start:prod
# 15. npm install pm2 -g
# 16. pm2 start 'npm run start:prod' --name ApiEvolution
# 17. pm2 startup
# 18. pm2 save --force