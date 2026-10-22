FROM alpine:3.20
RUN apk add --no-cache pgbouncer && adduser -D -H pgb
COPY pgbouncer.ini userlist.txt /etc/pgbouncer/
RUN chown -R pgb /etc/pgbouncer
USER pgb
EXPOSE 6432
CMD ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
