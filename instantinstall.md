#python tem que ser 3.13
# 1.  Download from https://github.com/EvolutionAPI/evolution-api.git .
# 2.  Download manager from https://github.com/EvolutionAPI/evolution-manager-v2/ or the right tree ( check on the evolution-api main branch)
# 3.  Install postgresql (sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm sudo dnf install -y postgresql15 postgresql15-server postgresql-devel python3.13-devel)
# 4.  Create postgresql user / superuser/ grant permissions / change login mode (pg_hba.conf//var/lib/pgsql/data/pg_hba.conf -> change method from ident/perr to md5)
## 4.5 (sudo su postgresql) (psql) (CREATE USER myuser WITH PASSWORD 'mypassword';) (ALTER USER myuser CREATEDB;)
# 5.  copy .env.example to .env and add redis and postgresql connection strings
# 6.  install nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# 7.  carrega nvm: source ~/.bashrc
# 8.  nvm install v24.11.1 && nvm use v24.11.1
# 9.  npm install
      npm run db:migrate:dev
      npm run db:generate:kwik
# 10. npm run db:generate
# 11. npm run db:deploy
# 12. npm run build
# 13. bash manager_install.sh
# 14. npm run start:prod
# 15. npm install pm2 -g
# 16. pm2 start 'npm run start:prod' --name ApiEvolution
# 17. pm2 startup
# 18. pm2 save --force
# Criar views: cd scripts/python
# . venv/bin/activate
# pip install -r requirements.txt

O arquivo de migração está em scripts/python (necessário instalar o venv com o python 3.13)

# Instalação postgresql
# Install the repository RPM:
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm

# Install PostgreSQL:
sudo dnf install -y postgresql15 postgresql15-server postgresql-devel python3.13-devel

# Optionally initialize the database and enable automatic start:
sudo /usr/pgsql-15/bin/postgresql-15-setup initdb
sudo systemctl enable postgresql-15
sudo systemctl start postgresql-15


## Lembrar de liberar no arquivo postgresql.conf para acesso com * ao invés do localhost e descomentar a linha