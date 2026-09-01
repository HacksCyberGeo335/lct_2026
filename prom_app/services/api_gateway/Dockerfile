FROM golang:1.22-alpine AS build

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/api_gateway ./cmd/api_gateway

FROM alpine:3.20

COPY --from=build /bin/api_gateway /bin/api_gateway

EXPOSE 8080

ENTRYPOINT ["/bin/api_gateway"]
