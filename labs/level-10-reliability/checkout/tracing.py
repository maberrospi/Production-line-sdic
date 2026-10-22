"""OpenTelemetry tracing, configured by the standard OTEL_* environment variables.

OTEL_SERVICE_NAME            the service name shown in Jaeger
OTEL_RESOURCE_ATTRIBUTES     extra attributes, here service.version
OTEL_EXPORTER_OTLP_ENDPOINT  where spans go (Jaeger's OTLP/HTTP port, 4318)
"""
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor


def setup(app):
    provider = TracerProvider(resource=Resource.create())   # reads the OTEL_* variables
    # Batch spans in memory and send them in the background, so tracing never slows a request.
    # This lab keeps every trace; production usually samples (for example 1-10% of requests).
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="metrics,health,stats,admin",
                                       exclude_spans=["receive", "send"])   # skip per-message ASGI spans
