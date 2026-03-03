# Use a imagem oficial e leve do Nginx baseada em Alpine Linux
FROM nginx:alpine

# Copie os arquivos do projeto para o diretório padrão onde o Nginx serve os arquivos web
COPY . /usr/share/nginx/html

# Expor a porta 80
EXPOSE 80

# Iniciar o servidor
CMD ["nginx", "-g", "daemon off;"]
