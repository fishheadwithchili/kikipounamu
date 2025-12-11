FROM golang:1.21-alpine AS builder

WORKDIR /app

# 安装依赖
COPY go.mod go.sum ./
RUN go mod download

# 复制源码
COPY . .

# 编译
RUN CGO_ENABLED=0 GOOS=linux go build -o /asr-server ./cmd/server

# 运行镜像
FROM alpine:3.18

RUN apk --no-cache add ca-certificates tzdata
ENV TZ=Pacific/Auckland

WORKDIR /app

COPY --from=builder /asr-server .

EXPOSE 8001

CMD ["./asr-server"]
