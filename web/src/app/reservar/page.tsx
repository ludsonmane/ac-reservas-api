'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import {
  Container, Stepper, Group, Button, Title, Text, Card, Grid, Badge,
  Select, NumberInput, TextInput, Alert, Stack, Box, rem
} from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import {
  IconCalendar,
  IconClockHour4,
  IconInfoCircle,
  IconCircleCheck,
  IconMapPin,
  IconUser,
  IconBuildingStore,
  IconUsers,
  IconBabyCarriage,
  IconMail,
  IconPhone
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import NextImage from 'next/image';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';

/* ===================== DADOS ===================== */
const UNIDADES = [
  { id: 'aguas-claras', label: 'Mané Mercado — Águas Claras' },
  { id: 'arena-brasilia', label: 'Mané Mercado — Arena Brasília' },
];

// placeholders externos (sem depender de /public/images)
const AREAS = [
  {
    id: 'salao',
    nome: 'Salão',
    desc: 'Interno, climatizado e confortável',
    foto:
      'https://images.unsplash.com/photo-1541542684-4a9c4af87c03?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 'varanda',
    nome: 'Varanda',
    desc: 'Externo, arejado e descontraído',
    foto:
      'https://images.unsplash.com/photo-1582582621950-48b395e0d9b2?q=80&w=1600&auto=format&fit=crop',
  },
  {
    id: 'bar',
    nome: 'Balcão',
    desc: 'Perfeito para 1–2 pessoas',
    foto:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1600&auto=format&fit=crop',
  },
];

// fallback externo
const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=1600&auto=format&fit=crop';

/* ===================== HELPERS ===================== */
const onlyDigits = (s: string) => s.replace(/\D+/g, '');
function maskCPF(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  const p1 = d.slice(0, 3); const p2 = d.slice(3, 6); const p3 = d.slice(6, 9); const p4 = d.slice(9, 11);
  return [p1, p2 && `.${p2}`, p3 && `.${p3}`, p4 && `-${p4}`].filter(Boolean).join('');
}
function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11); // 10 ou 11 dígitos no BR
  if (d.length <= 10) {
    // (99) 9999-9999
    return d
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  // (99) 99999-9999
  return d
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}
function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function isValidPhone(v: string) {
  const digits = onlyDigits(v);
  return digits.length === 10 || digits.length === 11;
}

function joinDateTimeISO(date: Date | null, time: string) {
  if (!date || !time) return null;
  const [hh, mm] = time.split(':').map(Number);
  const dt = dayjs(date).hour(hh || 0).minute(mm || 0).second(0).millisecond(0).toDate();
  return dt.toISOString();
}

/** ====== Regras de data/horário ====== */
const TODAY_START = dayjs().startOf('day').toDate(); // hoje 00:00
const OPEN_H = 12;   // 12:00
const OPEN_M = 0;
const CLOSE_H = 20;  // 20:30
const CLOSE_M = 30;

function isTimeOutsideWindow(hhmm: string) {
  if (!hhmm) return false;
  const [hh, mm] = hhmm.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false;

  // menor que 12:00
  if (hh < OPEN_H) return true;
  if (hh === OPEN_H && mm < OPEN_M) return true;

  // maior que 20:30
  if (hh > CLOSE_H) return true;
  if (hh === CLOSE_H && mm > CLOSE_M) return true;

  return false;
}

function timeWindowMessage() {
  return `Horário disponível entre ${String(OPEN_H).padStart(2, '0')}:${String(OPEN_M).padStart(2, '0')} e ${String(CLOSE_H).padStart(2, '0')}:${String(CLOSE_M).padStart(2, '0')}`;
}

/* ===================== COMPONENTES ===================== */
function AreaCard({
  foto, titulo, desc, selected, onSelect,
}: { foto: string; titulo: string; desc: string; selected: boolean; onSelect: () => void }) {
  const [src, setSrc] = useState(foto || FALLBACK_IMG);

  return (
    <Card
      withBorder
      radius="lg"
      p={0}
      onClick={onSelect}
      style={{
        cursor: 'pointer',
        overflow: 'hidden',
        borderColor: selected ? 'var(--mantine-color-green-5)' : 'transparent',
        boxShadow: selected ? '0 8px 20px rgba(16, 185, 129, .15)' : '0 2px 10px rgba(0,0,0,.06)',
        transition: 'transform .15s ease',
        background: '#FBF5E9',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      {/* imagem + overlay */}
      <Box style={{ position: 'relative', height: 160, background: '#f2f2f2' }}>
        <NextImage
          src={src}
          alt={titulo}
          fill
          sizes="(max-width: 520px) 100vw, 520px"
          style={{ objectFit: 'cover' }}
          onError={() => setSrc(FALLBACK_IMG)}
          priority={false}
          unoptimized   // evita configurar domains no next.config
        />
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,.45) 100%)',
          }}
        />
        {selected && (
          <Badge
            color="green"
            variant="filled"
            style={{ position: 'absolute', top: 10, right: 10 }}
          >
            Selecionada
          </Badge>
        )}
      </Box>

      <Box p="md">
        <Title order={4} style={{ margin: 0 }}>{titulo}</Title>
        <Text size="sm" c="dimmed" mt={4} style={{ lineHeight: 1.35 }}>{desc}</Text>
      </Box>
    </Card>
  );
}

/* ===================== PÁGINA ===================== */
export default function ReservarMane() {
  const router = useRouter();

  // Passos
  const [step, setStep] = useState(0);

  // Passo 1
  const [unidade, setUnidade] = useState<string | null>(UNIDADES[0].id);
  const [adultos, setAdultos] = useState<number | ''>(2);
  const [criancas, setCriancas] = useState<number | ''>(0);
  const [data, setData] = useState<Date | null>(null);
  const [hora, setHora] = useState<string>(''); // string vazia evita warning
  const [timeError, setTimeError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const total = useMemo(() => {
    const a = typeof adultos === 'number' ? adultos : 0;
    const c = typeof criancas === 'number' ? criancas : 0;
    return Math.max(1, Math.min(20, a + c));
  }, [adultos, criancas]);

  // Passo 2
  const [areaId, setAreaId] = useState<string | null>(AREAS[0].id);

  // Passo 3 (dados do cliente)
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);

  // Envio
  const [sending, setSending] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contactOk = isValidEmail(email) && isValidPhone(phone);
  const canNext1 = Boolean(unidade && data && hora && total > 0 && !timeError && !dateError);
  const canNext2 = Boolean(areaId);
  const canFinish =
    fullName.trim().length >= 3 &&
    onlyDigits(cpf).length === 11 &&
    contactOk;

  async function confirmarReserva() {
    setSending(true);
    setError(null);
    try {
      // defesas finais
      if (!data || !hora) {
        setError('Selecione data e horário.');
        setStep(0);
        setSending(false);
        return;
      }
      if (dayjs(data).isBefore(TODAY_START, 'day')) {
        setError('Data inválida. Selecione uma data a partir de hoje.');
        setStep(0);
        setSending(false);
        return;
      }
      if (isTimeOutsideWindow(hora)) {
        setError(`Horário indisponível. ${timeWindowMessage()}.`);
        setStep(0);
        setSending(false);
        return;
      }
      if (!contactOk) {
        setError('Preencha um e-mail e telefone válidos.');
        setSending(false);
        return;
      }

      const reservationISO = joinDateTimeISO(data, hora);
      const birthdayISO = birthday ? dayjs(birthday).startOf('day').toDate().toISOString() : undefined;

      const payload = {
        fullName,
        cpf: onlyDigits(cpf),
        people: total,
        reservationDate: reservationISO!,
        birthdayDate: birthdayISO,
        contactEmail: email.trim(),
        contactPhone: onlyDigits(phone),
        s_utm_source: 'site',
        s_utm_campaign: `${unidade}:${areaId}`,
      };

      const res = await apiPost<{ ok: true; id: string }>('/reservas', payload);
      setCreatedId(res.id);
      setStep(3);
    } catch {
      setError('Não foi possível concluir sua reserva agora. Tente novamente.');
    } finally {
      setSending(false);
    }
  }

  const area = AREAS.find(a => a.id === areaId);

  return (
    <Box style={{ background: '#ffffff', minHeight: '100dvh' }}>
      {/* HEADER */}
      <Box
        component="header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 3,
          background: '#ffffff',
          borderBottom: '1px solid #eee',
          paddingTop: 'calc(env(safe-area-inset-top))',
        }}
      >
        <Container
          size={480}
          px="md"
          style={{ marginTop: 'calc(env(safe-area-inset-top) + 60px)', marginBottom: 12 }}
        >
          <Stack gap={8} align="center">
            <NextImage
              src="/images/1.png"
              alt="Mané Mercado"
              width={150}
              height={40}
              style={{ height: 40, width: 'auto' }}
              priority
            />
            <Title
              order={2}
              ta="center"
              fw={400}
              style={{
                fontFamily: '"Alfa Slab One", system-ui, sans-serif',
                color: '#146C2E', // verde mais escuro
              }}
            >
              Mané Mercado Reservas
            </Title>

            <Text size="sm" c="dimmed" ta="center" style={{ fontFamily: '"Comfortaa", system-ui, sans-serif' }}>
              Águas Claras & Arena Brasília
            </Text>
          </Stack>

          {/* STEPPER com ícones */}
          <Stepper
            active={step}
            size="md"
            mt="md"
            color="green"
            allowNextStepsSelect={false}
            styles={{
              root: { maxWidth: 460, margin: '8px auto 0' },
              steps: { gap: rem(12) },
              step: { alignItems: 'center' },
              stepIcon: { width: rem(34), height: rem(34), borderWidth: 2 },
              stepBody: { marginTop: rem(6) },
              stepLabel: { fontWeight: 600, fontSize: rem(14) },
              stepDescription: { fontSize: rem(12), color: 'var(--mantine-color-dimmed)' },
              separator: { marginInline: rem(8), height: rem(2), background: 'rgba(0,0,0,.08)' },
            }}
          >
            <Stepper.Step
              icon={<IconCalendar size={18} />}
              label="1 • Reserva"
              description="Unidade, pessoas e horário"
            />
            <Stepper.Step
              icon={<IconMapPin size={18} />}
              label="2 • Área"
              description="Escolha onde quer sentar"
            />
            <Stepper.Step
              icon={<IconUser size={18} />}
              label="3 • Cadastro"
              description="Seus dados básicos"
            />
            <Stepper.Completed><></></Stepper.Completed>

          </Stepper>
        </Container>
      </Box>

      {/* CONTEÚDO */}
      <Container
        size={480}
        px="md"
        style={{
          minHeight: '100dvh',
          paddingTop: 12,
          paddingLeft: 'calc(env(safe-area-inset-left) + 16px)',
          paddingRight: 'calc(env(safe-area-inset-right) + 16px)',
          fontFamily: '"Comfortaa", system-ui, sans-serif',
        }}
      >
        {/* PASSO 1 */}
        {step === 0 && (
          <Stack mt="xs" gap="md">
            <Card withBorder radius="lg" shadow="sm" p="md" style={{ background: '#FBF5E9' }}>
              <Stack gap="md">
                <Select
                  label="Unidade *"
                  placeholder="Selecione"
                  data={UNIDADES.map(u => ({ value: u.id, label: u.label }))}
                  value={unidade}
                  onChange={setUnidade}
                  withAsterisk
                  leftSection={<IconBuildingStore size={16} />}
                  comboboxProps={{
                    styles: {
                      option: {
                        '&[data-selected] .mantine-Combobox-checkIcon': {
                          color: 'var(--mantine-color-green-6)',
                        },
                        '&[data-selected]': {
                          backgroundColor: 'rgba(16, 185, 129, 0.10)',
                        },
                      },
                    },
                  }}
                />

                <Grid gutter="md">
                  <Grid.Col span={6}>
                    <NumberInput
                      label="Adultos *"
                      min={1}
                      max={20}
                      value={adultos}
                      onChange={(value) => setAdultos(value === '' ? '' : Number(value))}

                      withAsterisk
                      leftSection={<IconUsers size={16} />}
                    />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <NumberInput
                      label="Crianças"
                      min={0}
                      max={10}
                      value={criancas}
                      onChange={setCriancas}
                      leftSection={<IconBabyCarriage size={16} />}
                    />
                  </Grid.Col>
                </Grid>

                <Grid gutter="md">
                  <Grid.Col span={6}>
                    <DatePickerInput
                      label="Data *"
                      value={data}
                      onChange={(v) => {
                        setData(v);
                        const invalid = v ? dayjs(v).isBefore(TODAY_START, 'day') : false;
                        setDateError(invalid ? 'Selecione uma data a partir de hoje' : null);
                      }}
                      withAsterisk
                      valueFormat="DD/MM/YYYY"
                      leftSection={<IconCalendar size={16} />}
                      allowDeselect={false}
                      minDate={TODAY_START}
                      size="md"
                      styles={{ input: { height: rem(48) } }}
                      error={dateError}
                    />
                  </Grid.Col>

                  <Grid.Col span={6}>
                    <TimeInput
                      label="Horário *"
                      value={hora}
                      onChange={(e) => {
                        const v = e.currentTarget.value || '';
                        setHora(v);
                        setTimeError(isTimeOutsideWindow(v) ? timeWindowMessage() : null);
                      }}
                      onBlur={() => {
                        setTimeError(isTimeOutsideWindow(hora) ? timeWindowMessage() : null);
                      }}
                      withAsterisk
                      leftSection={<IconClockHour4 size={16} />}
                      size="md"
                      styles={{ input: { height: rem(48) } }}
                      error={timeError}
                    />
                  </Grid.Col>
                </Grid>

                <Card withBorder radius="md" p="sm" style={{ background: '#fffdf7' }}>
                  <Text size="sm" ta="center">
                    <b>Total:</b> {total} pessoa(s) •{' '}
                    <b>Quando:</b> {data ? dayjs(data).format('DD/MM') : '--'}/{hora || '--:--'}{' '}
                    {dateError && <Text component="span" c="red">• {dateError}</Text>}
                    {timeError && <Text component="span" c="red"> • {timeError}</Text>}
                  </Text>
                </Card>
              </Stack>
            </Card>

            <Button color="green" radius="md" disabled={!canNext1} onClick={() => setStep(1)} type="button">
              Continuar
            </Button>
          </Stack>
        )}

        {/* PASSO 2 */}
        {step === 1 && (
          <Stack mt="xs" gap="md">
            {AREAS.map((a) => (
              <AreaCard
                key={a.id}
                foto={a.foto}
                titulo={a.nome}
                desc={a.desc}
                selected={areaId === a.id}
                onSelect={() => setAreaId(a.id)}
              />
            ))}

            <Group gap="sm">
              <Button variant="light" radius="md" onClick={() => setStep(0)} type="button" style={{ flex: 1 }}>
                Voltar
              </Button>
              <Button color="green" radius="md" onClick={() => setStep(2)} disabled={!canNext2} type="button" style={{ flex: 2 }}>
                Continuar
              </Button>
            </Group>
          </Stack>
        )}

        {/* PASSO 3 */}
        {step === 2 && (
          <Stack mt="xs" gap="md">
            <Card withBorder radius="lg" shadow="sm" p="md" style={{ background: '#FBF5E9' }}>
              <Stack gap="md">
                <TextInput
                  label="Nome completo *"
                  placeholder="Seu nome"
                  value={fullName}
                  onChange={(e) => setFullName(e.currentTarget.value)}
                  withAsterisk
                  leftSection={<IconUser size={16} />}
                />
                <TextInput
                  label="CPF *"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(maskCPF(e.currentTarget.value))}
                  withAsterisk
                />

                <Grid gutter="md">
                  <Grid.Col span={12}>
                    <TextInput
                      label="E-mail *"
                      placeholder="seuemail@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.currentTarget.value)}
                      withAsterisk
                      leftSection={<IconMail size={16} />}
                      error={email.length > 0 && !isValidEmail(email) ? 'Informe um e-mail válido' : null}
                    />
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <TextInput
                      label="Telefone *"
                      placeholder="(61) 99999-9999"
                      value={phone}
                      onChange={(e) => setPhone(maskPhone(e.currentTarget.value))}
                      withAsterisk
                      leftSection={<IconPhone size={16} />}
                      error={phone.length > 0 && !isValidPhone(phone) ? 'Informe um telefone válido' : null}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                      Usaremos e-mail/telefone apenas para entrar em contato caso necessário.
                    </Text>
                  </Grid.Col>
                </Grid>

                <DatePickerInput
                  label="Aniversário (opcional)"
                  placeholder="Selecionar"
                  value={birthday}
                  onChange={setBirthday}
                  valueFormat="DD/MM/YYYY"
                  allowDeselect
                  size="md"
                  styles={{ input: { height: rem(48) } }}   // mesmo tamanho dos demais
                  leftSection={<IconCalendar size={16} />}
                />
              </Stack>
            </Card>

            {error && <Alert color="red" icon={<IconInfoCircle />}>{error}</Alert>}

            <Card withBorder radius="md" p="sm" style={{ background: '#fffdf7' }}>
              <Text size="sm" ta="center">
                <b>Unidade:</b> {UNIDADES.find(u => u.id === unidade)?.label} • <b>Área:</b> {AREAS.find(a => a.id === areaId)?.nome}<br />
                <b>Pessoas:</b> {total} • <b>Data/Hora:</b> {data ? dayjs(data).format('DD/MM') : '--'}/{hora || '--:--'}
              </Text>
            </Card>

            <Group gap="sm">
              <Button variant="light" radius="md" onClick={() => setStep(1)} type="button" style={{ flex: 1 }}>
                Voltar
              </Button>
              <Button
                color="green"
                radius="md"
                loading={sending}
                disabled={!canFinish}
                onClick={confirmarReserva}
                type="button"
                style={{ flex: 2 }}
              >
                Confirmar reserva
              </Button>
            </Group>
          </Stack>
        )}

        {/* PASSO 4 */}
        {step === 3 && (
          <Card
            withBorder
            radius="lg"
            p="xl"
            shadow="md"
            mt="sm"
            style={{ background: '#FBF5E9' }}
          >
            <Stack gap="xs" align="center">
              <Box
                aria-hidden
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '3px solid var(--mantine-color-green-5)',
                  background: '#EFFFF3',
                }}
              >
                <IconCircleCheck size={34} color="var(--mantine-color-green-6)" />
              </Box>

              <Title order={3} mt="sm" ta="center" fw={400}>
                Reserva criada!
              </Title>

              <Text c="dimmed" ta="center" mt={4}>
                Código: <b>{createdId}</b>
              </Text>

              <Group justify="center" mt="md">
                <Button variant="light" onClick={() => setStep(0)} type="button">
                  Nova reserva
                </Button>
                <Button color="green" onClick={() => router.push('/reservas')} type="button">
                  Ver lista
                </Button>
              </Group>
            </Stack>
          </Card>
        )}

        <Box h={rem(32)} />
      </Container>
    </Box>
  );
}
