FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html manage.html style.css api.js script.js manage.js /usr/share/nginx/html/
COPY assets/oliva-mark.svg assets/oliva-mark-light.svg assets/food-fallback.svg assets/dish-pizza.svg assets/dish-pasta.svg assets/dish-lasagna.svg assets/dish-bread.svg assets/dish-dessert.svg assets/dish-rice.svg assets/dish-pudding.svg /usr/share/nginx/html/assets/
EXPOSE 80
