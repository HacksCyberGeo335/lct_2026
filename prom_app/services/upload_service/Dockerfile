FROM golang:1.22-alpine AS build

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/upload_service ./cmd/upload_service

FROM alpine:3.20

COPY --from=build /bin/upload_service /bin/upload_service

EXPOSE 8081

ENTRYPOINT ["/bin/upload_service"]
