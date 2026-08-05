FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /demo-tasks .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /demo-tasks /demo-tasks
EXPOSE 8080
ENTRYPOINT ["/demo-tasks"]
CMD ["--host", "0.0.0.0", "--port", "8080"]
