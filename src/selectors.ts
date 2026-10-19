/** Seletores do formulário de proposta (/project/bid/...), mapeados a partir do HTML logado. */
export const bidForm = {
  value: '#oferta',
  days: '#duracao-estimada',
  message: '#proposta',
  submit: '#btnConcluirEnvioProposta',
  /** Modal "Mantenha-se seguro..." que pede o aceite dos termos antes de enviar */
  confirmModal: '.modal-confirmacao-proposta-pergunta',
  confirmCheckbox: '#confirmar-envio-proposta',
  confirmContinue: '.modal-confirmacao-proposta-pergunta .btn-acao',
  /** Modal exibido quando o site detecta dados de contato ou links no texto */
  suspiciousModal: '.modal-padrao-suspeito-mensagem',
  errorMessages: '.formulario .input-error-msg .error-msg, .formulario .general-error-msg',
} as const;

/** Limite do textarea de detalhes (maxlength do campo #proposta). */
export const MAX_MESSAGE_LENGTH = 3000;
