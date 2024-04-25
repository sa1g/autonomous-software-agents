# Dockerfile
FROM aiplanning/planutils:latest

RUN pip3 install flask

RUN planutils install -f -y lama-first
RUN planutils install -f -y dual-bfws-ffparser
RUN planutils install -f -y delfi
RUN planutils install -f -y forbiditerative-topk
RUN planutils install -f -y enhsp-2020
RUN planutils install -f -y optic
RUN planutils install -f -y tfd

EXPOSE 5555

CMD planutils server --port 5555 --host 0.0.0.0
